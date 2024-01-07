# HiJumpBoots SpeedFeed

A fork of the ATProto Feed Generator (https://github.com/bluesky-social/feed-generator). This project has been modified to write to a persistent sqlite3 DB in the project's root.

# Keywords

The feed algorithm looks for certain words, regex matches, and bsky users. See `src/subscription.ts` for the full list.

# Running the Server

Install dependencies with yarn and then run the server with yarn start. This will start the server on port 3200.

# Publishing the Feed

Fill out `.env.example`, rename it to `.env`, and run `yarn publishFeed`.
