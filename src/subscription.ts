import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'

// main problem to get around: the slang use of 'speedrun' to denote doing something unrelated to speedrunning fast
// ex. Lowtax speedrun, christmas shopping speedrun, etc

const matchText: string[] = [
  // obvious
  '#speedrun',
  '#speedrunner',
  // events
  'agdq',
  'arpgme',
  'benelux speedrunner gathering',
  'bsg annual',
  'esa winter',
  'esa summer',
  'fastest furs',
  'finnruns',
  'games done quick',
  'gdq',
  'interglitches',
  'lady arcaders',
  'midspring speedfling',
  'midwest speedfest',
  'obscurathon',
  'prevent a thon',
  'really really long a thon',
  'really really lots of lore',
  'rtainjapan',
  '#rtain',
  'sgdq',
  'soaringspeedfest',
  'speedfest',
  'speedons',
  // speedrun + 'word'
  'speedrun marathon',
  'speedrun mode',
  'speedrun practice',
  'speedrun training',
  'speedrun routing',
  'speedrun stream',
  'speedrun wr',
  // bluesky (test; disable in release)
  //'bluesky',
]

const bannedText: string[] = [
  // obvious
  ' nsfw ',
  '#nsfw',
]

const matchPatterns: RegExp[] = [
  //SRC
  /(^|[\s\W])speedrun\.com($|[\W\s])/im,
  //oengus
  /(^|[\s\W])oengus\.io($|[\W\s])/im,
  //horaro
  /(^|[\s\W])horaro\.org($|[\W\s])/im,
  //'speedrun' AND a link to twitch.tv
  /speedrun($|.*)twitch.tv/im,
  //'speedrun' AND a link to youtube
  /speedrun($|.*)youtu.be/im,
  //'speedrun' AND 'pb'
  /(^|[\s\W])speedrun($|.*)pb($|[\W\s])/im,
  //'pb' AND 'speedrun'
  /(^|[\s\W])pb($|.*)speedrun($|[\W\s])/im,
  //twitch.tv/gamesdonequick
  /twitch\.tv\/gamesdonequick/im,
  //'really really' AND a link to twitch.tv
  /really really($|.*)twitch.tv/im,
]

// these users ONLY talk about speedrunning - scheduler bots, etc
const matchUsers: string[] = [
  //
  'did:plc:pz54re7np33stvrgz4bj6nbl', // rtajapan.bsky.social
]

// Exclude posts from these users
const bannedUsers: string[] = [
  //
]

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt)

    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    const postsToCreate = ops.posts.creates
      .filter((create) => {
        const txt = create.record.text.replace('-', ' ').toLowerCase()

        // cannot get TS to work with create.record.labels - fix later
        const plainTextLabels = JSON.stringify(create.record.labels ?? '{}')

        const postIsNsfw =
          plainTextLabels.includes('porn') ||
          plainTextLabels.includes('nudity') ||
          plainTextLabels.includes('sexual')

        return (
          (matchText.some((term) => txt.includes(term)) ||
            matchPatterns.some((pattern) => pattern.test(txt)) ||
            matchUsers.includes(create.author)) &&
          !bannedUsers.includes(create.author) &&
          !bannedText.some((term) => txt.includes(term)) &&
          !postIsNsfw
        )
      }) // validation function
      .map((create) => {
        // map speedrun related posts to a db row
        console.log(`Found post by ${create?.author}: ${create?.record?.text}`)

        //console.log(JSON.stringify(create))

        return {
          uri: create.uri,
          cid: create.cid,
          replyParent: create.record?.reply?.parent.uri ?? null,
          replyRoot: create.record?.reply?.root.uri ?? null,
          indexedAt: new Date().toISOString(),
        }
      })

    if (postsToDelete.length > 0) {
      await this.db
        .deleteFrom('post')
        .where('uri', 'in', postsToDelete)
        .execute()
    }
    if (postsToCreate.length > 0) {
      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }
  }
}
