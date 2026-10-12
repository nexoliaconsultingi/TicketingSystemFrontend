"use client"

import { useCallback, useEffect, useState } from "react"

import {
  userApi,
  type SendPasswordResponse,
  type UserCreateInput,
  type UserResponse,
  type UserUpdateInput,
} from "@/lib/api"
import { getToken } from "@/lib/auth"

function requireToken(): string {
  const token = getToken()
  if (!token) {
    throw new Error("Your session has expired. Please sign in again.")
  }
  return token
}

/**
 * Administration des utilisateurs du ticketing : liste, création, mise à jour,
 * suppression et envoi du mot de passe par email.
 * Le token de session est ajouté à chaque appel, comme pour l'administration société.
 */
export function useUsersAdmin() {
  const [users, setUsers] = useState<UserResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const token = requireToken()
      setUsers(await userApi.list(token))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load users.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const createUser = useCallback(async (input: UserCreateInput): Promise<string> => {
    const token = requireToken()
    const created = await userApi.create(token, input)
    await refresh()
    return created._id
  }, [refresh])

  const updateUser = useCallback(async (id: string, input: UserUpdateInput) => {
    const token = requireToken()
    await userApi.update(token, id, input)
    await refresh()
  }, [refresh])

  const deleteUser = useCallback(async (id: string) => {
    const token = requireToken()
    await userApi.remove(token, id)
    setUsers((current) => current.filter((user) => user._id !== id))
  }, [])

  /**
   * Envoie par email le mot de passe que l'admin vient de saisir.
   *
   * Le compte n'est pas modifié : le serveur vérifie seulement que le mot de
   * passe transmis est bien celui qui est en vigueur avant de l'emailer.
   */
  const sendPassword = useCallback(
    async (id: string, password: string): Promise<SendPasswordResponse> =>
      userApi.sendPassword(requireToken(), id, password),
    [],
  )

  return {
    users,
    loading,
    error,
    refresh,
    createUser,
    updateUser,
    deleteUser,
    sendPassword,
  }
}