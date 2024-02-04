
import { Client, GatewayIntentBits } from 'discord.js';
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
    "What's your name?",
    "How did you find out about this server?",
    "What are your interests?",
    // Add more questions as needed
];

client.on('guildMemberAdd', async member => {
    // Send a welcome message to the new member's DM
    const dmChannel = await member.createDM();
    await dmChannel.send("Welcome to the server! Let's start with a quick interview.");

    const answers = {};

    // Ask for the member's name
    await dmChannel.send(interviewQuestions[0]);  // Assuming the first question is "What's your name?"

    const filter = m => m.author.id === member.id; // Ensure the message is from the member
    try {
        const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] });
        const response = collected.first().content;
        answers['name'] = response;

        // Use the name to search for DUPR profile
        const playerData: DUPRResponse = await getDUPRByName(response);

        if (playerData.result.hits.length === 0) {
            await dmChannel.send("I couldn't find a DUPR profile with that name.");
        } else if (playerData.result.hits.length === 1) {
            // If only one result, confirm with the member
            await dmChannel.send(`Is this you? ${playerData.result.hits[0].fullName}, ${playerData.result.hits[0].shortAddress}, Rating: ${playerData.result.hits[0].ratings.doubles} (yes/no)  `);
            // You would then wait for a 'yes' or 'no' response and handle accordingly
        } else {
            // If multiple results, ask them to choose
            let options = playerData.result.hits.map((hit, index) => `${index + 1}: ${hit.fullName}, ${hit.shortAddress}, Rating: ${hit.ratings.doubles}`,).join('\n');
            await dmChannel.send(`I found multiple profiles. Which one is you?\n${options}`);
            // Wait for their numeric response to identify the correct profile
            const filter = m => m.author.id === member.id && !isNaN(parseInt(m.content));
            const numCollected = await dmChannel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] });
            const selectedNumber = parseInt(numCollected.first().content);
            const selectedProfile = playerData.result.hits[selectedNumber - 1];

            if (selectedProfile) {
                await dmChannel.send(`You selected: ${selectedProfile.fullName}, ${selectedProfile.shortAddress}, Rating: ${selectedProfile.ratings.doubles}`);
                // Handle the selected profile
            } else {
                await dmChannel.send("You didn't select a valid number.");
            }
        }
    } catch (error) {
        // Handle situation where the member didn't respond in time
        await dmChannel.send("You did not respond in time, please try to answer more promptly.");
    }

    // Continue with other interview questions...
    // ...
});


client.login(process.env.botToken);

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
        data : data
      };
      
      const axiosResponse = await axios.request(config);
      const playerData: DUPRResponse = axiosResponse.data;

      return playerData;
}
