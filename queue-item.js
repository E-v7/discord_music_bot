import ytdl from '@distube/ytdl-core'

/**
 * @description A single item in the music queue
 */
export class QueueItem {
    #song_name
    #youtube_link
    /**
     * @description Gets informaiton based on the youtube_link and stores
     * it into this queue item object
     * 
     * @param {string} youtube_link 
     */
    constructor(youtube_link) {
        var info = ytdl.getBasicInfo(youtube_link)
        this.#youtube_link = youtube_link
        this.#song_name = info.title
    }

    GetSongName() {
        return this.#song_name
    }

    GetSongLink() {
        return this.#youtube_link
    }
}