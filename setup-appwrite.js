const sdk = require("node-appwrite");

// CONFIGURATION - Change these if needed
const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1";
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID || "tictactoe";
const API_KEY = process.env.APPWRITE_API_KEY;

if (!API_KEY) {
  console.error("Error: APPWRITE_API_KEY environment variable is not set.");
  process.exit(1);
}

const client = new sdk.Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const databases = new sdk.Databases(client);

async function setup() {
  console.log("🚀 Starting Appwrite Setup...");

  try {
    // 1. Create Database
    console.log("Creating Database: main...");
    try {
      await databases.create("main", "Main Database");
      console.log("✅ Database 'main' created.");
    } catch (e) {
      if (e.code === 409) console.log("ℹ️ Database 'main' already exists.");
      else throw e;
    }

    // 2. Create Collection
    console.log("Creating Collection: games...");
    try {
      await databases.createCollection("main", "games", "Games", [
        sdk.Permission.read(sdk.Role.any()),
        sdk.Permission.create(sdk.Role.users()),
        sdk.Permission.update(sdk.Role.users()),
      ], true); // documentSecurity enabled
      console.log("✅ Collection 'games' created.");
    } catch (e) {
      if (e.code === 409) console.log("ℹ️ Collection 'games' already exists.");
      else throw e;
    }

    // 3. Create Attributes
    const attributes = [
      { key: "board", type: "string", size: 100, required: true },
      { key: "playerX", type: "string", size: 36, required: true },
      { key: "playerO", type: "string", size: 36, required: false },
      { key: "turn", type: "string", size: 36, required: true },
      { key: "winner", type: "string", size: 36, required: false },
      { key: "status", type: "string", size: 20, required: true },
    ];

    for (const attr of attributes) {
      console.log(`Creating attribute: ${attr.key}...`);
      try {
        await databases.createStringAttribute(
          "main",
          "games",
          attr.key,
          attr.size,
          attr.required
        );
        console.log(`✅ Attribute '${attr.key}' created.`);
      } catch (e) {
        if (e.code === 409) console.log(`ℹ️ Attribute '${attr.key}' already exists.`);
        else throw e;
      }
    }

    console.log("\n🎉 Setup Complete! Attributes may take a minute to index.");
    console.log("You can now run your frontend.");

  } catch (error) {
    console.error("\n❌ Setup Failed:");
    console.error(error.message);
  }
}

setup();
