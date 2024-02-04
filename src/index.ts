
import discord, { ActivityType, Client, Events, GatewayIntentBits, SlashCommandBuilder } from 'discord.js';


import dotenv from 'dotenv';

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

    for (const question of interviewQuestions) {
        await dmChannel.send(question);
        // Wait for their response
        // Note: You need to handle collecting and timing out responses here
        const filter = m => m.author.id === member.id; // Ensure the message is from the member
        try {
            const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] });
            const response = collected.first().content;
            answers[question] = response;
        } catch (error) {
            // Handle situation where the member didn't respond in time
            await dmChannel.send("You did not respond in time, please try to answer more promptly.");
            break; // Or ask the question again, or skip to the next question
        }
    }

    // Here you can handle the collected answers
    console.log(answers);
    // For example, save them to a file or a database, or process them as needed
});

client.login(process.env.botToken);
