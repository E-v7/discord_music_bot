import { fileURLToPath } from 'url'
import { dirname } from 'path'
import path from 'path'
import fs from 'fs'

// Get the absolute directory path to this file
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * @description A JSON object with the contents of the appsettings file
 */
export const appsettings = JSON.parse(fs.readFileSync(path.join(__dirname, 'appsettings.json')))

/**
 * @description Deletes all files from the cache folder
 * 
 * @returns {void}
 */
// Deletes all files currently in the cache. If cache does not exist it creates the folder
export function clearCache() {
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

export class Logger {
    static #log_file_path = path.join(__dirname, 'howie.log')
    constructor() {
        if (this instanceof Logger) {
            throw new Error('Cannot instantiate a static class')
        }
    }

    /**
     * @description Writes information into the log file
     * 
     * @param {string} info The info you want to insert into the log file
     * @param {object[]} items This is optional 
     */
    static Log(info, items = null) {
        var date_time = new Date(Date.now()).toLocaleString('en-US', {hour12: false}).replace(',', '')
        var items_string = ''

        if (items && !Array.isArray(items)) {
            items = [items]
        }

        if (items) {
            items.forEach((item) => {
                items_string += `${item} `
            })
        }

        var final_log_message = `${date_time} ${info} ${items_string}\n`
        fs.appendFile(this.#log_file_path, final_log_message, (err) => {
            if (err) {
                console.error('Could not write to the log file', err)
            }
        })
    }

    /**
     * @description Logs an error to the log file with some additional information
     * 
     * @param {Message} message 
     * @param {string} file The current file
     * @param {Error} error The error caught
     */
    static LogError(message, file, error) {
        Error.captureStackTrace(error, this.LogError)
        message.channel.send('<@141633745504567296>\nAn error was caught and logged')
        file = file.substring(file.lastIndexOf('\\') + 1)
        var additional_info = [error, '\n', error.stack]
        this.Log(file, additional_info)
    }
}