
import { Client, DMChannel, GatewayIntentBits, GuildMember } from 'discord.js';
import dotenv from 'dotenv';
import axios from 'axios';
import { DUPRResponse, DUPRResult } from './models';

dotenv.config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages]
});


client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

const interviewQuestions = [
    "What's your first and last name?",
];

// create enum of role ids and names
enum Roles {
    'Men' = '813204613830279208',
    'Women' = '813204779081007104',
    'Intermediate' = '837095698079285268',
    'Verified' = '838839368529215550',
    'Unverified' = '838840195083927603',
    'DERPERS' = '1063933394381181060'
}

client.on('guildMemberAdd', async member => {
    // Add the unverified role to the new member
    try {
        await member.roles.add(Roles.Unverified);
        console.log('Unverified role set for user', member.user.tag);
    }
    catch (e) {
        console.log('something went wrong setting verified role', e);
        return;
    }

    // Send a welcome message to the new member's DM
    let dmChannel: DMChannel;
    try {
        dmChannel = await member.createDM();
        await dmChannel.send("Welcome to Treasure Valley Pickleball! Let's start with a quick interview.");
    }
    catch (e) {
        console.log('something went wrong creating DM channel', e);
        return;
    }

    let searching = true;
    while (searching) {
        // Ask for the member's name
        await dmChannel.send(interviewQuestions[0]);  // Assuming the first question is "What's your name?"

        const filter = m => m.author.id === member.id; // Ensure the message is from the member
        try {
            const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
            const response = collected.first().content;

            // Use the name to search for DUPR profile
            const playerData: DUPRResponse = await getDUPRByName(response);

            if (playerData.result.hits.length === 0) {
                await dmChannel.send("I couldn't find a DUPR profile with that name. Would you like to try a different name? (yes/no)");
                const retryCollected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
                if (retryCollected.first().content.toLowerCase() !== 'yes') {
                    searching = false;
                }
            } else if (playerData.result.hits.length === 1) {
                // If only one result, confirm with the member
                await dmChannel.send(`Is this you?\n${playerData.result.hits[0].fullName}, ${playerData.result.hits[0].shortAddress}, Rating: ${playerData.result.hits[0].ratings.doubles} (yes/no)`);
                const confirmCollected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
                if (confirmCollected.first().content.toLowerCase() === 'yes') {
                    // handleConfirmedUser, like setting the nickname and roles
                    try {
                        await handleConfirmedUser(member, playerData, dmChannel);
                    }
                    catch (e) {
                        console.log('something went wrong handling confirmed user', e);
                    }

                    searching = false;
                }
            } else {
                // If multiple results, ask them to choose
                let options = playerData.result.hits.map((hit, index) => `${index + 1}: ${hit.fullName}, ${hit.shortAddress}, Rating: ${hit.ratings.doubles}`).join('\n');
                await dmChannel.send(`I found multiple profiles. Which one is you?\n${options}\nIf none of these are you, type 'none'.`);
                const numCollected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
                const selection = numCollected.first().content.toLowerCase();
                if (selection === 'none') {
                    await dmChannel.send("Let's try a different name. What is your name?");
                } else {
                    const selectedNumber = parseInt(selection);
                    const selectedProfile = playerData.result.hits[selectedNumber - 1];
                    if (selectedProfile) {
                        await dmChannel.send(`You selected: ${selectedProfile.fullName}, ${selectedProfile.shortAddress}, Rating: ${selectedProfile.ratings.doubles}`);

                        // handleConfirmedUser, like setting the nickname and roles
                        try {
                            await handleConfirmedUser(member, playerData, dmChannel);
                        }
                        catch (e) {
                            console.log('something went wrong handling confirmed user', e);
                        }

                        searching = false;
                    } else {
                        await dmChannel.send("You didn't select a valid number.");
                    }
                }
            }
        } catch (error) {
            console.log('Error:', error); // Log the error (if any
            // Handle situation where the member didn't respond in time
            await dmChannel.send("You did not respond in time, please try to answer more promptly.");
            searching = false;
        }
    }
});



client.login(process.env.botToken);

async function handleConfirmedUser(member: GuildMember, duprPlayerData: DUPRResponse, dmChannel: DMChannel) {
    const player = duprPlayerData.result.hits[0];
    await setMemberNickname(member, player.fullName);

    // if member is male, add men role
    // if member is female, add women role
    if (player.gender === 'MALE') {
        await member.roles.add(Roles.Men);
    }
    else if (player.gender === 'FEMALE') {
        await member.roles.add(Roles.Women);
    }

    // add verified role
    await member.roles.add(Roles.Verified);

    // remove unverified role
    await member.roles.remove(Roles.Unverified);

    await dmChannel.send("You have been verified and your roles have been set. Welcome to the server!");

}

async function getDUPRByName(playerName: string) {
    let data = JSON.stringify({
        "filter": {
            "lat": 43.61529,
            "lng": -116.36337,
            "radiusInMeters": 80467.2
        },
        "limit": 10,
        "offset": 0,
        "query": `*${playerName}*`
    });

    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://api.dupr.gg/player/v1.0/search',
        headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${process.env.duprToken}`,
            'Content-Type': 'application/json'
        },
        data: data
    };

    const axiosResponse = await axios.request(config);
    const playerData: DUPRResponse = axiosResponse.data;

    return playerData;
}

async function setMemberNickname(member: GuildMember, nickname: string) {
    try {
        await member.setNickname(nickname);
        console.log(`Nickname set to ${nickname} for user ${member.user.tag}`);
    } catch (error) {
        console.error(`Could not set nickname for ${member.user.tag}: ${error}`);
        // If the bot doesn't have permission or the member has a role higher than the bot
        // you could send a message to the user or log the error.
    }
}