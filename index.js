import dotenv from 'dotenv'
dotenv.config()
import { Client, GatewayIntentBits } from 'discord.js'
import { AudioPlayerStatus, joinVoiceChannel, createAudioPlayer, createAudioResource, VoiceConnectionStatus } from '@discordjs/voice'
import ytdl from '@distube/ytdl-core'
import ffmpegPath from 'ffmpeg-static'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

// Get the absolute directory path to this app
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load appsettings into variable
const appsettings = JSON.parse(fs.readFileSync(path.join(__dirname, 'appsettings.json')))

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
    'x': handleExit,    // Exit/Disconnect
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

    // Check if link is a live stream since we cannot download live streams and it must be handled differently
    const info = await ytdl.getInfo(request)
    if (info.videoDetails.isLiveContent || (info.videoDetails.lengthSeconds / 60) > appsettings.MAX_DOWNLOADABLE_VIDEO_DURATION) {
        message.channel.send(`Playing live streams is not yet supported (im literally caching all the songs on my pc :sob:)\nOh and videos over ${appsettings.MAX_DOWNLOADABLE_VIDEO_DURATION} minutes also won't be downloaded`)
        return
    }

    // Download song to cache and play
    var filePath = path.join(__dirname, 'cache', `song_${Date.now()}.mp3`)
    await downloadSongToCache(request, filePath)
    playSong(message.member.voice.channel, filePath, message)
}

// Downloads a song to the cache folder
async function downloadSongToCache(request, filePath) {
    return new Promise((resolve, reject) => {
        const stream = ytdl(request, { filter: 'audioonly', ffmpegPath })
        console.log(filePath)
        const writeStream = fs.createWriteStream(filePath)

        stream.pipe(writeStream)

        // Resolve when the download is finished
        writeStream.on('finish', () => {
            console.log('Download complete:', filePath);
            resolve()
        })

        // Reject on error
        writeStream.on('error', (error) => {
            console.error('Error downloading song:', error);
            reject(error)
        })
    })
}

// Play the song from the cache
function playSong(voiceChannel, filePath, message) {
    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
    })

    const player = createAudioPlayer()
    const resource = createAudioResource(filePath)

    connection.subscribe(player)
    player.play(resource)

    player.on(AudioPlayerStatus.Idle, () => {
        console.log('Finished playing, cleaning up')

        // Delete the cached file after playing
        fs.unlink(filePath, (err) => {
            if (err) console.error('Error deleting file:', err)
            else console.log('Deleted cached file:', filePath)
        })

        var disconnectTimeout = setTimeout(() => {
            connection.destroy()
        }, appsettings.TIMEOUT_MILLISECONDS)
    })

    player.on('error', (error) => {
        console.error('Player error:', error)
        connection.destroy()

        // Clean up cached file on error
        fs.unlink(filePath, (err) => {
            if (err) console.error('Error deleting file:', err);
            else console.log('Deleted cached file after error:', filePath);
        })
    })
}

// To be implemented
function handleSkip(message) {
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
        clearCache()
    }
}

// Deletes all files currently in the cache. If cache does not exist it creates the folder
function clearCache() {
    var cacheDirectory = path.join(__dirname, 'cache')
    fs.readdir(cacheDirectory, (err, files) => {
        if (err) {
            fs.mkdir(cacheDirectory, (err) => {
                if (err) {
                    console.error('Unable to create cache directory')
                }
            })
            return
        }

        for (const file of files) {
            fs.unlink(path.join(cacheDirectory, file), (err) => {
                if (err) {
                    console.error(`Error deleting file ${file}`, err)
                }
            })
        }
    })
}

// Changes the prefix to a new option
function handlePrefix(message) {
    var newPrefix = message.content.split(' ', 2)[1]
    appsettings.COMMAND_PREFIX = newPrefix

    // Update settings file with new appsettings data
    fs.writeFile(path.join(__dirname, 'appsettings.json'), appsettings, { flag: 'w+' })
}

// welcome howie
client.login(process.env.DISCORD_TOKEN)
client.once('ready', () => {
    console.log(`${client.user.tag} is online and ready!`)
    clearCache()
})
