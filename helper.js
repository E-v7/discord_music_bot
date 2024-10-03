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