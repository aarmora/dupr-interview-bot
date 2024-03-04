import axios from 'axios';
import { CalculatedDUPRResponse, DUPRResponse } from './models';

export async function getCurrentDUPR(duprId: number) {
    console.log('Getting current DUPR for', duprId);
    const url = `https://api.dupr.gg/player/v1.0/${duprId}`;
    const response = await axios.get(url);
    const data = response.data;

    return data.result.ratings ? parseFloat(data.result.ratings.doubles) : null;
}

export async function getDUPRByName(playerName: string) {
    if (!playerName) {
        return;
    }
    let data = JSON.stringify({
        "filter": {
            "lat": 43.61529,
            "lng": -116.36337,
            "radiusInMeters": 80467.2
        },
        "limit": 10,
        "offset": 0,
        "query": `*${playerName}*`
    });

    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://api.dupr.gg/player/v1.0/search',
        headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${process.env.duprToken}`,
            'Content-Type': 'application/json'
        },
        data: data
    };

    const axiosResponse = await axios.request(config);
    const playerData: DUPRResponse = axiosResponse.data;

    return playerData;
}

export async function getDUPRHalfLifeAndMatchTotal(duprId: number) {
    let config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: `https://api.dupr.gg/user/calculated/v1.0/stats/${duprId}`,
        headers: { 
          'x-api-key': 'A9ngSTklG56ZzutuvQOvC7h54YfGlFn21GojkSil', 
          'Authorization': `Bearer ${process.env.duprToken}`
        }
      };

    const axiosResponse = await axios.request(config);
    const calculatedDUPRResponse: CalculatedDUPRResponse = axiosResponse.data;

    const halfLife = calculatedDUPRResponse.result?.doubles?.halfLife && calculatedDUPRResponse.result.doubles.halfLife !== '-'  ? parseFloat(calculatedDUPRResponse.result.doubles.halfLife) : 0;
    const totalMatches = calculatedDUPRResponse.result?.doubles?.wins + calculatedDUPRResponse.result?.doubles?.losses;

    return {
        halfLife,
        totalMatches
    };
}