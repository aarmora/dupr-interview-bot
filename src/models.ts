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
