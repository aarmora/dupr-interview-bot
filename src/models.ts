export interface DUPRResponse {
    status: string;
    result: DUPRResult;
}

export interface DUPRResult {
    offset: number;
    limit: number;
    total: number;
    hits: DUPRPlayer[];
    totalValueRelation: string;
    hasPrevious: boolean;
    hasMore: boolean;
    empty: boolean;
}

export interface DUPRPlayer {
    id: number;
    fullName: string;
    shortAddress: string;
    gender: string;
    age: number;
    ratings: DUPRRatings;
    distance: string;
    enablePrivacy: boolean;
    distanceInMiles: number;
    isPlayer1: boolean;
    verifiedEmail: boolean;
    registered: boolean;
    duprId: string;
    showRatingBanner: boolean;
    status: string;
    sponsor: Record<string, unknown>; // or any specific type if sponsor has a defined structure
    lucraConnected: boolean;
}

export interface DUPRRatings {
    singles: string;
    singlesVerified: string;
    singlesProvisional: boolean;
    doubles: string;
    doublesVerified: string;
    doublesProvisional: boolean;
}

// DDB models
// Should only have one of these
export interface ProfileInformation {
    pk: string; // "profile#<discordId>"
    sk: string; // Constant value, e.g., "profile#info"
    duprId: number;
    discordId: string;
    nickname: string;
    createdAt: string; // ISO 8601 format or Unix timestamp
    updatedAt: string; // ISO 8601 format or Unix timestamp
}

// Will have lots of these for every check we make where we see a change in DUPR score
export interface DUPRHistory {
    pk: string; // "profile#<discordId>"
    sk: string; // "dupr#<timestamp>"
    newDUPR: number;
    halfLife: number;
    totalMatches: number;
    timestamp: string; // ISO 8601 format or Unix timestamp
}

// Maybe have lots of these? Not sure if we will want this at all. Potential here
export interface MatchRecord {
    pk: string; // "profile#<discordId>"
    sk: string; // "match#<timestamp>"
    matchId: string;
    outcome: 'WIN' | 'LOSS'; // Could be more detailed based on your needs
    timestamp: string; // ISO 8601 format or Unix timestamp
}

// Maybe this would be something?
export interface Achievement {
    pk: string; // "profile#<discordId>"
    sk: string; // "achievement#<achievementId>"
    achievementId: string;
    name: string;
    description: string;
    dateEarned: string; // ISO 8601 format or Unix timestamp
}

// APIResponseModel.ts

export interface DUPRDetails {
    averagePartnerDupr: string;
    averageOpponentDupr: string;
    averagePointsWonPercent: string;
    halfLife: string;
    wins: number;
    losses: number;
}

export interface ResultOverview {
    wins: number;
    losses: number;
    pending: number;
}

export interface CalculatedDUPR {
    singles: DUPRDetails;
    doubles: DUPRDetails;
    resultOverview: ResultOverview;
}

export interface CalculatedDUPRResponse {
    status: string;
    result: CalculatedDUPR;
}

