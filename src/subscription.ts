import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'

// main problem to get around: the slang use of 'speedrun' to denote doing something unrelated to speedrunning fast
// ex. Lowtax speedrun, christmas shopping speedrun, etc

const matchText: string[] = [
  // obvious
  ' #speedrun',
  ' #speedrunner',
  // events
  ' agdq',
  'arpgme',
  'benelux speedrunner gathering',
  'bsg annual',
  'esa winter',
  'esa summer',
  'fastest furs',
  'finnruns',
  'games done quick',
  'gamesdonequick',
  ' #gdq',
  ' gdq',
  'interglitches',
  'lady arcaders',
  'midspring speedfling',
  'midwest speedfest',
  'obscurathon',
  'power up with pride',
  'prevent a thon',
  'really really long a thon',
  'really really lots of lore',
  'rtainjapan',
  '#rtain',
  ' sgdq',
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
  // 'word' + speedrun
  'first speedrun',
  // bluesky (test; disable in release)
  //'bluesky',
]

const bannedText: string[] = [
  // obvious
  ' nsfw ',
  '#nsfw',
  ' anal ',
  ' anus ',
  ' ballsack ',
  ' biatch ',
  ' blowjob ',
  ' blow job ',
  ' bollock ',
  ' bollok ',
  ' boner ',
  ' boob ',
  ' bum ',
  ' butt ',
  ' buttplug ',
  ' clitoris ',
  ' cock ',
  ' coon ',
  ' cunt ',
  ' dick ',
  ' dildo ',
  ' dyke',
  ' fag ',
  ' feck ',
  ' fellate ',
  ' fellatio ',
  ' felching ',
  ' fudgepacker ',
  ' fudge packer ',
  ' hell ',
  ' homo ',
  ' jizz ',
  ' knobend ',
  ' knob end ',
  ' labia ',
  ' muff ',
  ' nigger ',
  ' nigga ',
  ' penis ',
  ' piss ',
  ' poop ',
  ' prick ',
  ' pube ',
  ' pussy ',
  ' scrotum ',
  ' slut ',
  ' smegma ',
  ' spunk ',
  ' tosser ',
  ' turd ',
  ' twat ',
  ' vagina ',
  ' wank ',
  ' whore ',
]

const matchPatterns: RegExp[] = [
  //SRC
  /(^|[\s\W])speedrun\.com($|[\W\s])/im,
  //oengus
  /(^|[\s\W])oengus\.io($|[\W\s])/im,
  //horaro
  /(^|[\s\W])horaro\.org($|[\W\s])/im,
  //'speedrun' AND a link to twitch.tv
  /speedrun[\s\S]*?twitch.tv/im,
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
  'did:plc:rqbyxmhdeyjsygglwxkhwnlb', // bigbadgameathon.bsky.social
  'did:plc:sucjrnduu3iytwhtt36g2d54', // gamesdonequick.bsky.social
  'did:plc:i52rffe5ktfyfgiunsirz7ge', // ladyarcaders.com
  'did:plc:zsk2ehpsgci254k3r3czqcpe', // pixelperfectevents.bsky.social
  'did:plc:q7ecflq2zteowyqgysmstb2e', // powerupwithpride.bsky.social
  'did:plc:yggbmd27ii4z3cpgpabaa2gn', // preventathon.bsky.social
  'did:plc:x6b5kfl6bnrgplbentbei6mg', // therpgvalkyries.bsky.social
  'did:plc:pz54re7np33stvrgz4bj6nbl', // rtajapan.bsky.social
  'did:plc:mfmbxqdlvkunpb2i2rwdtvhn', // therun.bsky.social
  'did:plc:275rmae3bc63ib5pcsmmtw5d', // fastestfurs.com
]

// Exclude posts from these users
const bannedUsers: string[] = [
  'did:plc:23thhiqwpowmlelje4ft76br', // gam1ng.bsky.social (bot content)
  'did:plc:25vwhhzdpnaujzookpsqxlns', // lpx.bsky.social (low effort content)
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
