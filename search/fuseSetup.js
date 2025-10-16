// import Fuse from "fuse.js";
// import fs from "fs";
// import path from "path";

// /**
//  * Returns a Fuse.js instance for a given state.
//  * If state is not provided, merges all states alphabetically.
//  * Handles spaces, underscores, case differences, and minor typos in state names.
//  */
// export function getFuseForState(state) {
//     const dataDir = path.resolve("./data");
//     let data = [];

//     // Read all JSON files
//     const files = fs.readdirSync(dataDir).filter((f) => f.endsWith(".json"));

//     if (state) {
//         // Normalize input state
//         const normalizedState = state.toLowerCase().replace(/\s+/g, "");

//         // Use Fuse.js to find the closest matching state file
//         const fuseStates = new Fuse(files, {
//             includeScore: true,
//             threshold: 0.3, // adjust for fuzzy matching strictness
//             keys: [],
//         });

//         const result = fuseStates.search(normalizedState);
//         const matchedFile = result[0]?.item;

//         if (!matchedFile) {
//             throw new Error(`No data found for state: ${state}`);
//         }

//         const filePath = path.join(dataDir, matchedFile);
//         data = JSON.parse(fs.readFileSync(filePath, "utf8"));
//     } else {
//         // No state → merge all JSON files alphabetically
//         const sortedFiles = files.sort();

//         for (const file of sortedFiles) {
//             const fileData = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));
//             data.push(...fileData);
//         }
//     }

//     return new Fuse(data, {
//         keys: ["CompanyName", "CompanyStateCode", "CIN"],
//         includeScore: true,
//         threshold: 0.1, // lower = more strict match
//     });
// }



/**
 * Returns Fuse.js search results for a given state (or all states if none specified).
 * - Uses fuzzy matching for both state names and company names.
 * - If no state is provided, searches through all JSON files alphabetically.
 */
import fs from "fs";
import path from "path";
import Fuse from "fuse.js";

export function getFuseForState(query, state) {
    console.log("🔥 getFuseForState called with:", { state, query });

    const dataDir = path.resolve("./data");
    const files = fs.readdirSync(dataDir).filter((f) => f.endsWith(".json"));
    console.log("📂 Available files:", files.length);

    let results = [];

    if (state) {
        // Normalize the input state for comparison
        const normalizedState = state
            .toLowerCase()
            .replace(/\s+/g, "_")  // Convert spaces to underscores
            .replace(/&/g, "and")   // Handle names like "Daman & Diu"
            .replace(/[^a-z_]/g, ""); // Remove symbols

        console.log("🧠 normalizedState:", normalizedState);

        // Try to find exact or closest file
        const fuseStates = new Fuse(files, {
            includeScore: true,
            threshold: 0.3,
        });

        const result = fuseStates.search(normalizedState);
        console.log("🔍 fuseStates result:", result);

        const matchedFile = result[0]?.item;

        console.log("🎯 matchedFile:", matchedFile);

        if (!matchedFile) {
            console.error(`❌ No data found for state: ${state}`);
            return [];
        }

        // ✅ Ensure full path
        const filePath = path.join(dataDir, matchedFile);
        console.log("📄 Reading file:", filePath);

        const fileData = JSON.parse(fs.readFileSync(filePath, "utf8"));

        const fuse = new Fuse(fileData, {
            keys: ["CompanyName", "CompanyStateCode", "CIN"],
            includeScore: true,
            threshold: 0.1,
        });

        results = fuse.search(query).map((r) => r.item);
    } else {
        console.log("🌍 No state provided — scanning all files");
        const sortedFiles = files.sort((a, b) => a.localeCompare(b));

        for (const file of sortedFiles) {
            const fileData = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));
            const fuse = new Fuse(fileData, {
                keys: ["CompanyName", "CompanyStateCode", "CIN"],
                includeScore: true,
                threshold: 0.1,
            });
            const matched = fuse.search(query).map((r) => r.item);
            if (matched.length) {
                console.log(`✅ Found ${matched.length} matches in ${file}`);
                results.push(...matched);
            }
        }
    }

    console.log("📊 Total results found:", results.length);
    return results;
}

// getFuseForState("", "sun");
