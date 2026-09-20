export interface Request {
  cookies: {
    access_token?: string
    person_id?: string
  }
  pid: string | undefined
}
