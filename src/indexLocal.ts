import { fetchLatestDUPRScores } from "./leaderboard-bot";


(async () => {
    const latestDUPRs = await fetchLatestDUPRScores();

    console.log('latestDUPRs', latestDUPRs);


})();