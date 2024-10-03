import { AudioResource, createAudioPlayer, createAudioResource, joinVoiceChannel, VoiceConnection, AudioPlayerStatus, VoiceConnectionStatus } from '@discordjs/voice'
import ytdl from '@distube/ytdl-core'
import ffmpegPath from 'ffmpeg-static'
import { Message } from 'discord.js'
import { appsettings } from './helper.js'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import path from 'path'
import fs from 'fs'

// Get the absolute directory path to this file
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * @description The Howie Music Player handles playing music
 */
export class HowieMusicPlayer {
    /**
     * @type {AudioPlayer}
     */
    #player
    /**
     * @type {VoiceConnection}
     */
    #connection
    /**
     * @type {AudioResource}
     */
    #resource
    /**
     * @type {boolean}
     */
    #enabled_content_streaming

    /**
     * @description If set to true uses streaming instead of caching songs
     * 
     * @param {boolean} enable_content_streaming 
     */
    constructor(enable_content_streaming) {
        this.#player = createAudioPlayer()
        this.#enabled_content_streaming = enable_content_streaming
    }

    /**
     * Currently this only supports caching mode
     * 
     * @description Adds a song to the end of the queue
     * 
     * @param {Message} message 
     */
    async addSong(message) {
        if (this.enable_content_streaming) {
            message.channel.send("Streaming is not a completed feature yet, please use caching for now")
            return
        }

        var youtube_link = message.content.split(' ', 2)[1]

        // Verify this is a video we want to process
        const info = await ytdl.getInfo(youtube_link)
        var is_over_duration = (info.videoDetails.lengthSeconds / 60) > appsettings.MAX_DOWNLOADABLE_VIDEO_DURATION
        if (info.videoDetails.isLiveContent || is_over_duration) {
            if (info.videoDetails.isLiveContent) {
                message.channel.send('Playing live streams is not yet allowed')
            }
            if (is_over_duration) {
                message.channel.send(`Video is over the maximum allowed video duration of ${appsettings.MAX_DOWNLOADABLE_VIDEO_DURATION} minutes`)
            }
            return
        }

        var filePath = path.join(__dirname, 'cache', `song_${Date.now()}.mp3`)
        await this.#downloadSongToCache(youtube_link, filePath)
        this.#playSong(message.member.voice.channel, filePath, message)
    }
    // this.#connection = joinVoiceChannel()
    // this.#resource = createAudioResource()
    // Downloads a song to the cache folder
    async #downloadSongToCache(youtube_link, filePath) {
        return new Promise((resolve, reject) => {
            const stream = ytdl(youtube_link, { filter: 'audioonly', ffmpegPath })
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

    #disconnectTimeout
    // Play the song from the cache
    #playSong(voiceChannel, filePath, message) {
        this.#connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator,
        })

        this.#player = createAudioPlayer()
        this.#resource = createAudioResource(filePath)

        this.#connection.subscribe(this.#player)
        this.#player.play(this.#resource)

        this.#player.on(AudioPlayerStatus.Idle, () => {
            console.log('Finished playing, cleaning up')

            // Delete the cached file after playing
            fs.unlink(filePath, (err) => {
                if (err) console.error('Error deleting file:', err)
                else console.log('Deleted cached file:', filePath)
            })

            // Clear any existing disconnect timeout when a song starts playing
            if (this.#disconnectTimeout) {
                clearTimeout(this.#disconnectTimeout)
                this.#disconnectTimeout = null
            }
            
            this.#disconnectTimeout = setTimeout(() => {
                // If after the TIMEOUT_MILLISECONDS time the player is still idle disconnect
                if (this.#connection && this.#connection.state.status != VoiceConnectionStatus.Destroyed && this.#player.state.status == AudioPlayerStatus.Idle) {
                    this.#connection.destroy()
                    console.log('Connection destroyed due to inactivity')
                }
            }, appsettings.TIMEOUT_MILLISECONDS)
        })

        this.#player.on('error', (error) => {
            console.error('Player error:', error)
            this.#connection.destroy()

            // Clean up cached file on error
            fs.unlink(filePath, (err) => {
                if (err) console.error('Error deleting file:', err);
                else console.log('Deleted cached file after error:', filePath);
            })
        })
    }
}