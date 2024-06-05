export default class MalformedUUIDError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MalformedUUIDError"
  }
}