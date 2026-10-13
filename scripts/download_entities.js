import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const entitiesDir = path.resolve(__dirname, "../behavior_pack/entities");

if (!fs.existsSync(entitiesDir)) {
  fs.mkdirSync(entitiesDir, { recursive: true });
}

const mobFiles = [
  "creeper.json", "zombie.json", "zombie_villager.json", "zombie_villager_v2.json",
  "husk.json", "drowned.json", "skeleton.json", "stray.json", "wither_skeleton.json",
  "spider.json", "cave_spider.json", "witch.json", "slime.json", "magma_cube.json",
  "enderman.json", "silverfish.json", "endermite.json", "guardian.json", "elder_guardian.json",
  "phantom.json", "pillager.json", "vindicator.json", "evocation_illager.json", "ravager.json",
  "vex.json", "piglin_brute.json", "hoglin.json", "zoglin.json", "blaze.json", "ghast.json",
  "shulker.json", "warden.json", "wither.json", "breeze.json", "bogged.json", "ender_dragon.json",
  "iron_golem.json", "wolf.json", "polar_bear.json", "bee.json", "panda.json",
  "piglin.json", "zombie_pigman.json", "goat.json", "dolphin.json", "llama.json",
  "trader_llama.json", "snow_golem.json",
  "cow.json", "sheep.json", "pig.json", "chicken.json", "horse.json", "donkey.json", "mule.json",
  "villager.json", "villager_v2.json", "wandering_trader.json", "cat.json", "ocelot.json", "parrot.json",
  "rabbit.json", "fox.json", "bat.json", "strider.json", "axolotl.json", "glow_squid.json", "squid.json",
  "turtle.json", "allay.json", "frog.json", "tadpole.json", "camel.json", "sniffer.json", "armadillo.json",
  "mooshroom.json", "skeleton_horse.json", "zombie_horse.json"
];

function fetchAndProcess(file) {
  return new Promise((resolve, reject) => {
    const url = `https://raw.githubusercontent.com/Mojang/bedrock-samples/main/behavior_pack/entities/${file}`;
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch ${file}: status ${res.statusCode}`));
      }
      let raw = "";
      res.on("data", chunk => raw += chunk);
      res.on("end", () => {
        try {
          const cleaned = raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
          const json = JSON.parse(cleaned);

          // Standardize format_version to 1.21.0 for broad engine compatibility
          json.format_version = "1.21.0";

          const entity = json["minecraft:entity"];
          if (entity) {
            if (!entity.components) {
              entity.components = {};
            }

            // Ensure nameable is always_show: true
            entity.components["minecraft:nameable"] = {
              always_show: true,
              allow_name_tag_renaming: true
            };

            // Also ensure any component_groups have always_show: true if they define nameable
            if (entity.component_groups) {
              for (const groupKey of Object.keys(entity.component_groups)) {
                const group = entity.component_groups[groupKey];
                if (group && group["minecraft:nameable"]) {
                  group["minecraft:nameable"].always_show = true;
                  group["minecraft:nameable"].allow_name_tag_renaming = true;
                }
              }
            }
          }

          const outPath = path.join(entitiesDir, file);
          fs.writeFileSync(outPath, JSON.stringify(json, null, 2), "utf8");
          console.log(`Saved: ${file} (always_show: true)`);
          resolve(file);
        } catch (err) {
          reject(new Error(`Error processing ${file}: ${err.message}`));
        }
      });
    }).on("error", reject);
  });
}

async function main() {
  console.log(`Fetching and configuring ${mobFiles.length} mob entity definitions...`);
  for (const file of mobFiles) {
    try {
      await fetchAndProcess(file);
    } catch (err) {
      console.error(err.message);
    }
  }

  // Also generate zombified_piglin.json with matching identifier
  try {
    const pigmanPath = path.join(entitiesDir, "zombie_pigman.json");
    if (fs.existsSync(pigmanPath)) {
      const pigman = JSON.parse(fs.readFileSync(pigmanPath, "utf8"));
      if (pigman["minecraft:entity"]?.description) {
        pigman["minecraft:entity"].description.identifier = "minecraft:zombified_piglin";
      }
      const zPiglinPath = path.join(entitiesDir, "zombified_piglin.json");
      fs.writeFileSync(zPiglinPath, JSON.stringify(pigman, null, 2), "utf8");
      console.log("Saved: zombified_piglin.json (always_show: true)");
    }
  } catch (err) {
    console.error("Error creating zombified_piglin.json:", err.message);
  }

  console.log("\nFinished generating behavior pack entity definitions!");
}

main();

