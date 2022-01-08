/**
 * Manage console messages and errors.
 */
export default class Log {

    /**
     * Throw an Error with a message.
     * @param {string} message
     * @param {string} type
     */
    static error(message: string,
                 type?: 'eval' | 'range' | 'reference' | 'syntax' | 'type' | 'uri') {
        switch (type) {
            case 'eval':
                throw new EvalError(message)
            case 'range':
                throw new RangeError(message)
            case 'reference':
                throw new ReferenceError(message)
            case 'syntax':
                throw new SyntaxError(message)
            case 'type':
                throw new TypeError(message)
            case 'uri':
                throw new URIError(message)
            default:
                throw new Error(message)
        }
    }

    /**
     * Print an info message.
     * @param {string} message
     */
    static info(message: string) {
        console.log(message)
    }

    /**
     * Print a debug message.
     * @param {string} message
     */
    static debug(message: string) {
        console.debug(message)
    }

}