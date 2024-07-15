import { parse, Options as AcornOptions, ExportAllDeclaration, ImportDeclaration, ImportExpression, Literal } from 'acorn'
import { simple } from 'acorn-walk'
import { open, readFile } from 'fs/promises'
import { join } from 'path'

// Steps, for each type or import, get the character string

// After that, run through and create the substitutions

export interface ImportModifierOptions extends AcornOptions {
    /**
     * A custom way to specify if an import/export string is a local file
     * 
     * For the basic implementation. we suggest @see BasicFileExtensionTransform
     * where you add .js to all your imports and and then either transform to .mjs or .cjs
     * if you are building for commonjs or esm
     */
    localImportTransform: LocalImportTransform
}

/**
 * Simple class for implementing transforms on import values
 */
export interface LocalImportTransform {
    /**
     * Guarantees you will only get this called for values that return true for islocalFile
     *
     * @param {string} value the import file string
     * @returns {string} the transformed import
     */
    transform(value: string): string

    /**
     * Used to determine is a file should be transformed
     *
     * @param {string} value the import file string
     * @returns {boolean} true if the file is local and should be modified
     */
    isLocalFile(value: string): boolean
}

export class BasicFileExtensionTransform implements LocalImportTransform {
    readonly localExt: string
    readonly toExt: string

    constructor(options: {
        localExt: string
        toExt: string 
    }) {
        if (!options.localExt.startsWith('.')) {
            throw new Error('localExt must start with .')
        }
        if (!options.toExt.startsWith('.')) {
            throw new Error('localExt must start with .')
        }
        this.localExt = options.localExt
        this.toExt = options.toExt
    }

    transform(value: string): string {
        return `${value.substring(0, value.length - this.localExt.length)}${this.toExt}`
    }

    isLocalFile(value: string): boolean {
        return value.endsWith(this.localExt)
    }
}

/**
 * An import modifier captures a file that we want to modify imports on.  Due to the async optimization
 * of file opening, this does follow the init() pattern, where you must init() the instance before being
 * able to run modification operations
 *
 * NOTE: given that this is a class with methods to modify the state of its underlying source,
 * the instance itself performs analysis of the file when initiatlized and then works from cache.
 */
class ImportModifier {

    filePath: string
    options: AcornOptions
    localImportTransform: LocalImportTransform

    private substituteLiterals: Literal[] = []
    private fileTransformed = false
    private initialized = false

    constructor(filePath: string, options: ImportModifierOptions) {
        this.filePath = filePath
        this.options = options
        // configured by default to assume typescript with .js files and eslint rules
        this.localImportTransform = options.localImportTransform
    }

    async init() {
        await this.getImportsToModify()
        this.initialized = true
        return this
    }

    /**
     * Parses the local file and builds up the subsitutes list
     */
    private async getImportsToModify() {
        const str = (await readFile(this.filePath)).toString()
        const tree = parse(str, this.options)
        simple(tree, {
            ExportAllDeclaration: (exportNode: ExportAllDeclaration) => {
                this.tryAddToSubstituteList(exportNode.source)
            },
            ImportDeclaration: (importNode: ImportDeclaration) => {
                this.tryAddToSubstituteList(importNode.source)
            }
        })
        // sort the substitutes from first to last
        this.substituteLiterals = this.substituteLiterals.sort((l1, l2) => {
            return l1.start - l2.start
        })
    }

    /**
     * Since esm requires .js extensions and typescript doesn't play nice with transforming,
     * we expect that you have added .js onto your imports/exports and enforced it via lint, etc.
     *
     * @param value 
     */
    private tryAddToSubstituteList(literal: Literal) {
        if (this.localImportTransform.isLocalFile(literal.value as string)) {
            this.substituteLiterals.push(literal)
        }
    }

    private initGuard() {
        if (!this.initialized) {
            throw new Error('Must initialize ImportModifier before use')
        }
    }

    /**
     * Change the file that this transform is based on.  This will throw an error if
     * called multiple times.
     */
    async modifyToFile() {
        this.initGuard()
        if (this.fileTransformed) {
            throw new Error(`modifyFile already called on ${this.filePath}`)
        }
        let filehandle = null
        try {
            filehandle = await open(this.filePath, 'r+')

            const fileBuffer = await filehandle.readFile()

            await filehandle.writeFile(await this.replace(fileBuffer), 'utf-8')
        } finally {
            await filehandle?.close()
        }
        this.fileTransformed = true
    }

    /**
     * Use this method if you would like to understand that change to the file but not apply the file
     * 
     * This will return the buffer of the transformed file that this class is registered for
     * @returns 
     */
    async modifyToBuffer(): Promise<Buffer> {
        this.initGuard()
        let filehandle = null
        try {
            filehandle = await open(this.filePath, 'r+')

            const fileBuffer = await filehandle.readFile()

            return await this.replace(fileBuffer)
        } finally {
            await filehandle?.close()
        }
    }

    /**
     * Takes in a fileBuffer, applies the transforms, and returns the amended Buffer
     * @param fileBuffer 
     */
    private async replace(fileBuffer: Buffer): Promise<Buffer> {
        // Do the buffer level inserts
        let lastSplitIdx = 0
        const splitBuffers = []
        this.substituteLiterals.forEach((literal) => {
            // Add the last segment
            splitBuffers.push(fileBuffer.subarray(lastSplitIdx, literal.start))
            // Add this current literal with a transform
            const literalStr = fileBuffer.subarray(literal.start, literal.end).toString()
            // literals carry quotes
            const firstChar = literalStr.charAt(0)
            if (firstChar === '\'' || firstChar === '"') {
                const innerText = literalStr.substring(1, literalStr.length - 1)
                splitBuffers.push(Buffer.from(firstChar + this.localImportTransform.transform(innerText) + firstChar, 'utf-8'))
            } else {
                splitBuffers.push(Buffer.from(this.localImportTransform.transform(literalStr), 'utf-8'))
            }
            lastSplitIdx = literal.end + 1
        })
        // We need the last piece of the buffer
        if (lastSplitIdx !== fileBuffer.length) {
            splitBuffers.push(fileBuffer.subarray(lastSplitIdx))
        }

        return Buffer.concat(splitBuffers)
    }

    /**
     * Returns the local imports on the file
     * 
     * @returns
     */
    get localImports(): Literal[] {
        this.initGuard()
        return this.substituteLiterals
    }
 }

async function main() {

    const options: ImportModifierOptions = {
        ecmaVersion: 6,
        sourceType: 'module',
        localImportTransform: new BasicFileExtensionTransform({
            localExt: '.js',
            toExt: '.mjs',
        })
    }

    const idxFile = new ImportModifier(join(__dirname, '..', 'dist', 'esm', 'index.js'), options)
    const huhFile = new ImportModifier(join(__dirname, '..', 'dist', 'esm', 'huh.js'), options)

    await idxFile.init()
    await huhFile.init()
    const wuh = await huhFile.modifyToBuffer()
    console.log(wuh.toString())
}

void main()