import dotenv from 'dotenv'
dotenv.config()
import { Client, GatewayIntentBits } from 'discord.js'
import fs from 'fs'
import * as helper from './helper.js'
import { appsettings } from './helper.js'
import { HowieMusicPlayer } from './howie-music-player.js'

const howie = new HowieMusicPlayer(appsettings.USE_MUSIC_STREAMING)

// This is a VoiceChannelConnection but must be global to destroy in other functions since there can only be one connection
let connection

// The discord bot client
const client = new Client( {
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
})

// All bot commands and the functions they belong to
let botCommands = {
    'h': handleHelp,    // help
    'p': handlePlay,    // play
    's': handleSkip,    // skip
    'x': handleExit,    // exit
    'prefix': handlePrefix // Change the prefix
}

// Listen to every message sent by users and handle it if needed
client.on('messageCreate', async (message) => {
    // Bot should do nothing in the following cases:
    //  1. Message is null
    //  2. Message length is less than 2
    //  3. Message does not contain a command this bot can handle
    if (message == null) {
        return
    }
    if (message.content.length < 2) {
        return
    }
    if (message.author.bot) {
        return
    }

    // request[0] - Command ex. /p
    // request[1] - Actual request ex. a youtube link
    var request = message.content.split(' ', 2)

    // Check if prefix for this bot was used
    if (!request[0].includes(appsettings.COMMAND_PREFIX)) {
        return
    }

    var command = request[0].split(appsettings.COMMAND_PREFIX)[1]
    if (!botCommands[command]) {
        return
    }

    // Just give the entire message and allow the function to determine
    //  how to use it
    botCommands[command](message)
})

// Handles a help request and explains the commands to the users
function handleHelp(message) {
    message.channel.send(`
**In progress**

Current commands:
/p [youtube url] Plays/adds youtube audio to queue
/s Skips song
/x Force disconnect bot from voice channel
/h Show help

This is actually a lie, /p always overrides the song and there is no queue and skip actually just stops the song and leaves the voice channel currently

You know what, just assume none of this is accurate right now
    `)
}

// Handles a play song request
async function handlePlay(message) {
    // Only play is a user is in a voice channel
    if (!message.member.voice.channel) {
        console.log('User is not in a voice channel')
        return
    }

    // Get the youtube link
    var request = message.content.split(' ', 2)[1]

    // Check for a link
    if (request == null) {
        console.log('User tried to play a song without parameter')
        return
    }

    howie.addSong(message)
}

// To be implemented
function handleSkip(message) {
    if (!appsettings.BOT_COMMAND.SKIP.ENABLED) {
        message.channel.send(appsettings.BOT_COMMAND.DISABLED_MESSAGE)
        return
    }

    player.stop()
    if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
        connection.destroy()
        console.log('connection destroyed from skip request')
    }
}

// Destroys the connection the bot has to the voice channel and clears cache
function handleExit() {
    if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
        connection.destroy() 
        console.log('connection destroyed from exit request')
        helper.clearCache()
    }
}

// Changes the prefix to a new option
function handlePrefix(message) {
    var newPrefix = message.content.split(' ', 2)[1]

    if (newPrefix == null) {
        return
    }

    if (appsettings.COMMAND_PREFIX == newPrefix) {
        message.channel.send('That prefix is already being used')
        return
    }
    
    appsettings.COMMAND_PREFIX = newPrefix

    // Update settings file with new appsettings data
    var filePath = path.join(__dirname, 'appsettings.json')
    fs.writeFile(filePath, JSON.stringify(appsettings, null, '\t'), { flag: 'w+' }, (err) => {
        if (err) {
            message.channel.send('Something went wrong and the prefix wasn\'t changed')
            console.error('Updating settings failed', err)
            return
        } else {
            message.channel.send(`Prefix has been updated to '${newPrefix}'`)
        }
    })
}

// welcome howie
client.login(process.env.DISCORD_TOKEN)
client.once('ready', () => {
    console.log(`${client.user.tag} is online and ready!`)
    helper.clearCache()
})
