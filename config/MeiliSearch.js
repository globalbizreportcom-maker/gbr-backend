import { MeiliSearch } from "meilisearch";

export const client = new MeiliSearch({
    host: 'http://127.0.0.1:7700', // Meilisearch local server
    apiKey: 'tSjRK9vpZN5XfMvqGzZAbypA5kTZbUiIJMoYtDrBPFI' // your master key
});
