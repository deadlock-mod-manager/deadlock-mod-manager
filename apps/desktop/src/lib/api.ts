import { ModDto } from '@deadlock-mods/utils'
import axios from 'axios'

export const api = axios.create({
  baseURL: 'http://localhost:9000', // TODO: get from env
  headers: {
    'Content-Type': 'application/json'
  }
})

export const getMods = async () => {
  const response = await api.get<ModDto[]>('/mods')
  return response.data
} // TODO: pagination
