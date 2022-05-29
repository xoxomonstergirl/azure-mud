import { globalPresenceMessage } from '../globalPresenceMessage'
import { userHeartbeatReceived } from '../heartbeat'
import { staticRoomData } from '../rooms'
import setUpRoomsForUser from '../setUpRoomsForUser'
import { RoomResponse } from '../types'
import { User, isMod, minimizeUser } from '../user'
import { AuthenticatedEndpointFunction, LogFn, Result } from '../endpoint'
import DB from '../redis'

const connect: AuthenticatedEndpointFunction = async (user: User, inputs: any, log: LogFn) => {
  log('We have a user!', user.id)
  const result: Result = {}

  // WARNING: For now, checking the existence of a roomId in roomData is a good safeguard
  // But this may bite us when/if we ever have programmatic room creation
  if (user.roomId === undefined || !staticRoomData[user.roomId]) {
    user.roomId = 'entryway'
  }

  await DB.setCurrentRoomForUser(user, user.roomId)
  await userHeartbeatReceived(user)

  const users = await DB.getAllUsers()
  const userMap = {}
  users.forEach(u => {
    userMap[u.id] = minimizeUser(u)
  })

  const response: RoomResponse = {
    roomId: user.roomId,
    presenceData: await DB.allRoomOccupants(),
    users: userMap,
    // TODO: This will only include the current room
    roomData: staticRoomData,
    // TODO: Have a function to delete the keys we don't need
    profile: user
  }

  // TODO: The thing that dynamically fetches room data should
  // be smart enough to include roomNotes if necessary
  if (staticRoomData[user.roomId].hasNoteWall) {
    response.roomNotes = await DB.getRoomNotes(user.roomId)
  }

  result.httpResponse = {
    status: 200,
    body: response
  }

  result.groupManagementTasks = [
    ...setUpRoomsForUser(user.id, user.roomId),
    {
      userId: user.id,
      groupId: user.roomId,
      action: 'add'
    }
  ]

  if (await isMod(user.id)) {
    result.groupManagementTasks.push({
      userId: user.id,
      groupId: 'mods',
      action: 'add'
    })
  }

  const minimalUser = minimizeUser(user)

  result.messages = [
    {
      groupId: user.roomId,
      target: 'playerConnected',
      arguments: [minimalUser]
    },
    {
      target: 'usernameMap',
      arguments: [{ [user.id]: minimalUser }]
    },
    await globalPresenceMessage([user.roomId])
  ]

  log('Finished all of "connect"')
  log(result)

  return result
}

export default connect
