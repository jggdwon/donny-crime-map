
export interface CrimeLocation {
  latitude: string;
  longitude: string;
  street: {
    id: number;
    name: string;
  };
}

export interface CrimeOutcomeStatus {
  category: string;
  date: string;
}

export interface Crime {
  id: number;
  persistent_id: string;
  category: string;
  location: CrimeLocation;
  month: string;
  outcome_status: CrimeOutcomeStatus | null;
  // For internal use
  _marker?: any;
}

export interface StopSearchLocation {
    latitude: string;
    longitude: string;
    street: {
        id: number;
        name: string;
    };
}

export interface StopSearch {
    age_range: string;
    datetime: string;
    gender: string;
    involved_person: boolean;
    legislation: {
        name: string;
    } | null;
    location: StopSearchLocation | null;
    object_of_search: string | null;
    officer_defined_ethnicity: string;
    self_defined_ethnicity: string;
    outcome: string;
    type: string;
}

export interface CrimeCategory {
  url: string;
  name: string;
}

export interface Insight {
    area: string;
    insight: string;
}

export interface PredictiveHotspot {
    area: string;
    latitude: number;
    longitude: number;
    predictedCrimeType: string;
    reason: string;
}

export interface ModalState {
    briefing: boolean;
    trend: boolean;
    insights: boolean;
    predictive: boolean;
}

export interface SortConfig {
    key: string;
    direction: 'asc' | 'desc';
}
