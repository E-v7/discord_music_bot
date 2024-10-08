import { AudioResource, createAudioPlayer, createAudioResource, joinVoiceChannel, VoiceConnection, AudioPlayerStatus, VoiceConnectionStatus } from '@discordjs/voice'
import ytdl from '@distube/ytdl-core'
import ffmpegPath from 'ffmpeg-static'
import { Message, VoiceState } from 'discord.js'
import { appsettings, Logger } from './helper.js'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import path from 'path'
import fs from 'fs'
import { QueueItem } from './queue-item.js'

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
     * @type {QueueItem[]}
     */
    #queue

    /**
     * @description If set to true uses streaming instead of caching songs
     * 
     * @param {boolean} enable_content_streaming 
     */
    constructor(enable_content_streaming) {
        this.#player = createAudioPlayer()
        this.#enabled_content_streaming = enable_content_streaming
        this.#queue = []
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

        var is_playlist = youtube_link.includes('playlist')
        if (is_playlist) {
            var issue = 'Video cannot be played because of the following'
            issue += '\n- Link was to a playlist, we are still working on implementing that feature'
            message.channel.send(issue)
            return
        }


        // Verify this is a video we want to process
        let info
        try {
            info = await ytdl.getInfo(youtube_link)
        } catch (err) {
            // Replace this later with a proper logging system
            message.channel.send('<@141633745504567296> \nIt looks like an error was encountered while trying to play a song ```' + err + '```')
            return
        }

        var is_over_duration = (info.videoDetails.lengthSeconds / 60) > appsettings.MAX_DOWNLOADABLE_VIDEO_DURATION
        
        if (info.videoDetails.isLiveContent || is_over_duration || is_playlist) {
            var issue = 'Video cannot be played because of the following'
            if (info.videoDetails.isLiveContent) {
                issue += '\n- Playing live streams is not yet allowed'
            }
            if (is_over_duration) {
                issue += `\n- Video is over the maximum allowed video duration of ${appsettings.MAX_DOWNLOADABLE_VIDEO_DURATION} minutes`
            }
            if (is_playlist) {
                issue += '\n- Link was to a playlist, this feature is not supported yet'
            }

            message.channel.send(issue)
            return
        }

        // If queue contains a song and the music player isn't already playing a song
        if (this.#player.state.status != AudioPlayerStatus.Idle) {
            console.log(`Pushing new song on to queue ${youtube_link}`)
            var new_song = new QueueItem(youtube_link)
            this.#queue.push(new_song)
            message.channel.send('Song added to queue')
            return
        }

        
        var filePath = path.join(__dirname, 'cache', `song_${Date.now()}.mp3`)
        try {
            await this.#downloadSongToCache(youtube_link, filePath)
            this.#playSong(message.member.voice.channel, filePath, message)
        } catch (err) {
            message.channel.send('It looks like an error was encountered while trying to play a song\n\n' + err)
        }
    }
    
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
    /**
     * 
     * @param {VoiceState.channel} voiceChannel 
     * @param {string} filePath 
     * @param {Message} message 
     */
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
            console.log('Song finished playing, deleting from cache')
            // Delete the cached file after playing
            fs.unlink(filePath, (err) => {
                if (err) {
                    Logger.LogError(message, __filename, [err])
                }
                else {
                    console.log('Deleted cached file:', filePath)
                }
            })

            // Clear any existing disconnect timeout when a song starts playing
            if (this.#disconnectTimeout) {
                clearTimeout(this.#disconnectTimeout)
                this.#disconnectTimeout = null
            }

            if (this.#queue.length > 0) {
                var new_song_link = this.#queue.shift().GetSongLink()
                message.content = `${message.content.split(' ', 2)[0]} ${new_song_link}`
                this.addSong(message)
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
                if (err) {
                    Logger.LogError(message, __filename, [err])
                }
                else {
                    console.log('Deleted cached file after player error:', filePath)
                }
            })
        })
    }

    /**
     * @description Forces the player to stop triggering the Idle listener to fire
     * 
     * @param {Message} message 
     */
    skipSong(message) {
        if (this.#player.state.status != AudioPlayerStatus.Playing) {
            message.channel.send('There is no song currently playing')
            return
        }

        message.channel.send('Song skipped')
        this.#player.stop()
    }

    /**
     * @description Plays the song at the specified queue position immediately by
     * putting it at the beginning of the queue 
     * 
     * @param {Message} message
     * @param {int} queue_position Pass null to skip to next song
     */
    #playSongInPosition(message, queue_position) {        
        if (queue_position > this.#queue.length) {
            message.channel.send('Queue position doesn\'t exist')
            return
        }

        // Zero indexed
        queue_position--
        
        // Get the link for the song
        var new_song_link = this.#queue.splice(queue_position, 1)[0].GetSongLink()
        this.#queue.unshift(new_song_link)
        this.#player.stop()
    }

    /**
     * @description Formats a message and displays it into the channel the message came from
     * 
     * @param {Message} message The message that requested the queue to be displayed
     */
    DisplayCurrentQueue(message) {
        var response_message = '**Queue**\n'
        this.#queue.forEach((item, index) => {
            response_message += `${index + 1}. ${item.GetSongName()}${index + 1 < this.#queue.length ? '\n' : ''}`
        })

        message.channel.send(response_message)
    }
}