import { ChannelType, Client, DMChannel, GatewayIntentBits, GuildBasedChannel, GuildChannel, GuildMember } from 'discord.js';
import dotenv from 'dotenv';
import axios from 'axios';
import { DUPRHistory, DUPRResponse, DUPRResult, ProfileInformation } from './models';
import { DynamoDBClient, QueryCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommandInput, ScanCommandInput, TranslateConfig } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { getCurrentDUPR, getDUPRByName, getDUPRHalfLifeAndMatchTotal } from './duprCalls';

dotenv.config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages]
});

const tableName = 'tvp';
// Initialize the DynamoDB Client
const dynamodbClient = new DynamoDBClient({
    requestHandler: new NodeHttpHandler({
        connectionTimeout: 300000, // 5 minute timeout
        socketTimeout: 300000 // 5 minute timeout
    }),
    region: 'us-east-1'
});

const translateConfig: TranslateConfig = {
    marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: true
    }
};
const docClient = DynamoDBDocumentClient.from(dynamodbClient, translateConfig);

client.on('ready', async (clientStuff) => {
    const guilds = clientStuff.guilds.cache.toJSON();
    for (let i = 0; i < guilds.length; i++) {
        const guild = guilds[i];
        console.log('Current guild', guild.name);
        const unsuccessful: any[] = [];

        // get all guild members
        const members = (await guild.members.fetch()).toJSON();

        for (let i = 0; i < members.length; i++) {
            const member = members[i];
            console.log('Current member', member.user.username);

            // get profile info from DDB using member.id
            const profileInfo: ProfileInformation = await getProfileInformation(member.id);
            console.log('Profile info', profileInfo);

            // If we find a profile and a duprId, we'll add a new DUPR history
            if (profileInfo && profileInfo.duprId) {
                await addNewDUPRHistory(member.id, profileInfo.duprId);
            }
            // if there is no profileInfo, we'll try to create one
            else if (!profileInfo) {
                if (!member.nickname) {
                    unsuccessful.push(member.user.username);
                    continue;
                }

                // If no profile info is found, create one
                // we'll need to do our best to get their duprId based on their nickname
                console.log('No profile info found for', member.nickname);
                const DUPRResponse = await getDUPRByName(member.nickname);
                // found a DUPR, let's check how close it matches the nickname
                if (DUPRResponse?.result?.hits?.length) {
                    // compare the nickname to the DUPR name
                    const duprName = DUPRResponse.result.hits[0].fullName;
                    const closeness = levenshteinCloseness(member.nickname, duprName);

                    if (closeness > 0.85) {
                        console.log('DUPR name is close to nickname, creating profile info');
                        await createProfileInformation(member.id, member.nickname, DUPRResponse.result.hits[0].id);
                    }
                    else {
                        console.log('DUPR name is not close to nickname, creating profile without duprId');
                        await createProfileInformation(member.id, member.nickname);
                    }
                }
                else {
                    console.log('No DUPR found for', member.nickname ? member.nickname : member.user.username, 'creating profile info w/o duprId');
                    await createProfileInformation(member.id, member.nickname ? member.nickname : member.user.username);
                }
            }
        }

        const adminModsChannel: GuildBasedChannel = guild.channels.cache.find(channel => channel.name === 'admin-mods' && channel.type === ChannelType.GuildText);
        if (adminModsChannel && adminModsChannel.isTextBased()) {
            // send unsuccessful profile creations to admin-mods
            // format it into one string and send it in one message
            if (unsuccessful.length) {
                const message = unsuccessful.join('\n');
                await adminModsChannel.send(`Unsuccessful profile creations:\n${message}`);
            }
        } else {
            console.log('admin-mods channel not found');
        }


    };
    console.log(`Logged in as ${client.user.tag}!`);

    // send leaderboard to leaderboard channel
    const leaderboardChannel: GuildBasedChannel = clientStuff.guilds.cache.first().channels.cache.find(channel => channel.name === 'dupr-local-leaderboard' && channel.type === ChannelType.GuildText);
    if (leaderboardChannel && leaderboardChannel.isTextBased()) {
        const latestDUPRs = await fetchLatestDUPRScores();
        // truncate to 1900 characters
        const truncatedLatestDUPRs = latestDUPRs.length > 1900 ? latestDUPRs.substring(0, 1900) : latestDUPRs;
        const explanation = '`Must have greater than 20 matches and a half life greater than 7.`';
        await leaderboardChannel.send(`**DUPR leaderboard:**\n${explanation}\n\n${truncatedLatestDUPRs}`);
    } else {
        console.log('admin-mods channel not found');
    }
});

client.login(process.env.leaderBoardBotToken).catch(console.error);

async function addNewDUPRHistory(discordId: string, duprId: number) {
    let newDUPR;
    try {
        newDUPR = await getCurrentDUPR(duprId);
    }
    catch (e) {
        console.log('Error getting current DUPR', e.message);
        throw 'Error getting current DUPR';
    }

    let halfLife, totalMatches;
    try {
        const halfLifeAndMatchTotalResponse = await getDUPRHalfLifeAndMatchTotal(duprId);
        halfLife = halfLifeAndMatchTotalResponse.halfLife;
        totalMatches = halfLifeAndMatchTotalResponse.totalMatches;
    }
    catch (e) {
        console.log('Error getting calculated DUPR', e.message);
        throw 'Error getting calculated DUPR';

    }

    // First, get the most recent DUPR
    const mostRecentDUPR = await getMostRecentRecordedDUPR(discordId);
    console.log('mostRecentDUPR for discordId', discordId, mostRecentDUPR, newDUPR);

    if (Number.isNaN(newDUPR)) {
        console.log('No DUPR games for discordId', discordId);
        return;
    }

    // Check if the newDUPR is different from the most recent DUPR
    if (mostRecentDUPR !== null && mostRecentDUPR === newDUPR) {
        console.log(`No change in DUPR for Discord ID ${discordId}. Skipping update.`);
        return; // Skip the update if there's no change
    }

    // Proceed with updating the DUPR history if there's a change
    const now = new Date();
    const history: DUPRHistory = {
        pk: `profile#${discordId}`,
        sk: `dupr#${now.toISOString()}`, // Use ISO 8601 format for the timestamp
        newDUPR,
        halfLife,
        totalMatches,
        timestamp: now.toISOString(),
    };

    try {
        const command = new PutCommand({
            TableName: tableName,
            Item: history,
        });

        await docClient.send(command);
        console.log(`DUPR history updated for Discord ID ${discordId}`);
    } catch (error) {
        console.error("Error updating DUPR history:", error);
        throw error;
    }
}

async function getMostRecentRecordedDUPR(discordId: string): Promise<number | null> {
    const params: QueryCommandInput = {
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk and begins_with(sk, :skPrefix)',
        ExpressionAttributeValues: {
            ':pk': { S: `profile#${discordId}` },
            ':skPrefix': { S: 'dupr#' },
        },
        ScanIndexForward: false,
        Limit: 1,
    };

    try {
        const command = new QueryCommand(params);
        const response: any = await docClient.send(command);

        // Check if Items exist and has at least one entry
        if (response.Items && response.Items.length > 0) {
            console.log('response.Items', response.Items[0]);
            const newDUPR: number = unmarshall(response.Items[0]).newDUPR;
            // Assuming newDUPR is stored as a number. If it's stored as a string, you may need to parse it.
            return typeof newDUPR === 'number' ? newDUPR : parseFloat(newDUPR);
        } else {
            console.log(`No DUPR entries found for discordId: ${discordId}`);
            return null;
        }
    } catch (error) {
        console.error("Error fetching the most recent DUPR:", error);
        throw error;
    }
}

async function getProfileInformation(discordId: string) {
    const params: QueryCommandInput = {
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk and sk = :sk',
        ExpressionAttributeValues: {
            ':pk': { S: `profile#${discordId}` },
            ':sk': { S: 'profile#info' },
        },
        Limit: 1,
    };

    try {
        const command = new QueryCommand(params);
        const response: any = await docClient.send(command);

        // Check if Items exist and has at least one entry
        if (response.Items && response.Items.length > 0) {
            return unmarshall(response.Items[0]) as ProfileInformation;
        } else {
            console.log(`No profile information found for discordId: ${discordId}`);
            return null;
        }
    } catch (error) {
        console.error("Error fetching profile information:", error);
        throw error;
    }
}

async function createProfileInformation(discordId: string, nickname: string, duprId?: number) {
    const now = new Date();
    const profileInfo: ProfileInformation = {
        pk: `profile#${discordId}`,
        sk: 'profile#info',
        duprId: duprId,
        discordId: discordId,
        nickname: nickname,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
    };

    try {
        const command = new PutCommand({
            TableName: tableName,
            Item: profileInfo,
        });

        await docClient.send(command);
        console.log(`Profile information created for Discord ID ${discordId}`);
    } catch (error) {
        console.error("Error creating profile information:", error);
        throw error;
    }
}

function levenshteinCloseness(nickname: string, duprName: string) {
    if (nickname.length < duprName.length) {
        [nickname, duprName] = [duprName, nickname];
    }

    const nicknameLength = nickname.length;
    const duprNameLength = duprName.length;

    if (duprNameLength === 0) {
        return 1 - nicknameLength === 0 ? 1 : 0; // Exact match if both are empty, else no match
    }

    let prevRow = Array.from({ length: duprNameLength + 1 }, (_, i) => i);
    let currentRow = [];

    for (let i = 1; i <= nicknameLength; i++) {
        currentRow = [i];
        for (let j = 1; j <= duprNameLength; j++) {
            const insertions = currentRow[j - 1] + 1;
            const deletions = prevRow[j] + 1;
            const substitutions = nickname[i - 1] === duprName[j - 1] ? prevRow[j - 1] : prevRow[j - 1] + 1;
            currentRow.push(Math.min(insertions, deletions, substitutions));
        }
        prevRow = currentRow;
    }

    // Calculate closeness as a percentage
    const distance = currentRow[duprNameLength];
    const maxLength = Math.max(nicknameLength, duprNameLength);
    const closeness = 1 - (distance / maxLength);

    return closeness;
}

export async function fetchLatestDUPRScores() {
    // Assuming you have a way to list all unique Discord IDs or pk values
    const discordIds = await getAllDiscordIds(); // Implement this function based on your application's needs

    const promises = discordIds.map(async ({discordId, nickname}) => {
        const params: QueryCommandInput = {
            TableName: tableName,
            KeyConditionExpression: "pk = :pk and begins_with(sk, :skPrefix)",
            ExpressionAttributeValues: {
                ":pk": { S: `profile#${discordId}` },
                ":skPrefix": { S: "dupr#" },
            },
            ScanIndexForward: false, // This will ensure the latest items are first
            Limit: 1, // We only want the latest DUPR entry
        };

        try {
            const { Items } = await docClient.send(new QueryCommand(params));
            if (Items.length > 0) {
                const item = unmarshall(Items[0]);
                return {
                    discordId: discordId,
                    nickname: nickname,
                    ...item,
                };
            }
            return null;
        } catch (error) {
            console.error("Error fetching DUPR history for ID:", discordId, error);
            return null;
        }
    });

    const results: any = await Promise.all(promises);
    let filteredResults = results.filter((result) => result !== null);

    // Sort the results based on the newDUPR value
    // filter out any with a halflife less than 7
    // and total matches less than 20
    filteredResults.sort((a, b) => b.newDUPR - a.newDUPR);
    filteredResults = filteredResults.filter((result) => result.halfLife >= 7 && result.totalMatches >= 20);    

    // let's make three arrays, one for everyone > 4.5, one for everyone > 4.0, and one for everyone else and put the top 10 from each into a string
    const topPlayers = filteredResults.filter((result) => result.newDUPR > 4.5).slice(0, 10);
    const highPlayers = filteredResults.filter((result) => result.newDUPR > 4.0 && result.newDUPR <= 4.5).slice(0, 10);
    const otherPlayers = filteredResults.filter((result) => result.newDUPR <= 4.0).slice(0, 10);

    // now combine them into one string with line breaks that can be displayed in discord.
    // Put titles before each section "Top 10 Players 4.5+", "Top 10 Players 4.0-4.5", "Top 10 Players < 4.0"
    const topPlayersString = topPlayers.map((result) => `${result.nickname}: ${result.newDUPR}`).join('\n');
    const highPlayersString = highPlayers.map((result) => `${result.nickname}: ${result.newDUPR}`).join('\n');
    const otherPlayersString = otherPlayers.map((result) => `${result.nickname}: ${result.newDUPR}`).join('\n');
    
    return `**Top 10 Players 4.5+**\n${topPlayersString}\n\n**Top 10 Players 4.0-4.5**\n${highPlayersString}\n\n**Top 10 Players < 4.0**\n${otherPlayersString}`;
}

async function getAllDiscordIds() {
    try {
        const params: ScanCommandInput = {
            TableName: tableName,
            FilterExpression: "sk = :skVal",
            ExpressionAttributeValues: {
                ":skVal": { S: "profile#info" },
            },
        };

        const results = [];
        let items;
        do {
            items = await docClient.send(new ScanCommand(params));

            items.Items.forEach((item) => {
                const profile = unmarshall(item);
                if (profile.discordId) {
                    results.push({
                        discordId: profile.discordId,
                        nickname: profile.nickname
                    });
                }
            });

            params.ExclusiveStartKey = items.LastEvaluatedKey;
        } while (items.LastEvaluatedKey);

        return results;
    } catch (error) {
        console.error("Error retrieving Discord IDs:", error);
        throw error;
    }
}


