import { Crime, StopSearch, Insight, PredictiveHotspot } from '../types';
import moment from 'moment';

// The backend server URL. When running locally, it's localhost.
// In production on the VM, Nginx will proxy requests from the same host,
// so we can use a relative path.
const API_BASE_URL = import.meta.env.PROD
  ? '' // Relative path for production (VM with Nginx proxy)
  : import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'; // Use env var or default to localhost for dev

async function callAIApi(body: object): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to call AI API');
    }

    const data = await response.json();
    return data;
}

const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const formatCategory = (category: string) => category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

const findNearbyEvents = (
    lat: number,
    lng: number,
    month: string | moment.Moment,
    allCrimes: Crime[],
    allStopSearches: StopSearch[]
) => {
    const targetMoment = moment(month);
    const oneMonthBefore = targetMoment.clone().subtract(1, 'month');
    const oneMonthAfter = targetMoment.clone().add(1, 'month');
    const proximityRadiusKm = 0.25;

    const nearbyCrimes = allCrimes.filter(c => {
        if (!c.location?.latitude || !c.location?.longitude) return false;
        const cLat = parseFloat(c.location.latitude);
        const cLng = parseFloat(c.location.longitude);
        if(isNaN(cLat) || isNaN(cLng)) return false;
        return haversineDistance(lat, lng, cLat, cLng) <= proximityRadiusKm && moment(c.month).isBetween(oneMonthBefore, oneMonthAfter, undefined, '[]');
    });

    const nearbyStopSearches = allStopSearches.filter(ss => {
        if (!ss.location?.latitude || !ss.location?.longitude) return false;
        const ssLat = parseFloat(ss.location.latitude);
        const ssLng = parseFloat(ss.location.longitude);
        if(isNaN(ssLat) || isNaN(ssLng)) return false;
        return haversineDistance(lat, lng, ssLat, ssLng) <= proximityRadiusKm && moment(ss.datetime).isBetween(oneMonthBefore, oneMonthAfter, undefined, '[]');
    });

    return { nearbyCrimes, nearbyStopSearches, proximityRadiusKm };
};

export async function generateIncidentBriefing(
    crime: Crime, 
    allCrimes: Crime[], 
    allStopSearches: StopSearch[]
): Promise<string> {
    const { category, month, location } = crime;
    const crimeLat = parseFloat(location.latitude);
    const crimeLng = parseFloat(location.longitude);

    if(isNaN(crimeLat) || isNaN(crimeLng)) return "Briefing not available due to invalid location data.";

    const { nearbyCrimes, nearbyStopSearches, proximityRadiusKm } = findNearbyEvents(crimeLat, crimeLng, month, allCrimes, allStopSearches);

    const formattedNearbyCrimes = nearbyCrimes.map(c => ({
        type: formatCategory(c.category),
        date: moment(c.month).format('MMMM YYYY'),
        street: c.location?.street?.name ?? 'Unknown Street'
    }));

    const formattedNearbyStopSearches = nearbyStopSearches.map(ss => ({
        type: ss.type || 'N/A',
        date: moment(ss.datetime).format('YYYY-MM-DD HH:mm'),
        objectOfSearch: ss.object_of_search || 'N/A',
        street: ss.location?.street?.name ?? 'Unknown Street'
    }));


    const prompt = `You are a highly experienced detective AI. Analyze a specific crime incident and provide a comprehensive incident briefing. Combine factual context, insightful deductions about what likely happened, and relevant proximity event data.

**Main Incident Details:**
- Crime Type: ${formatCategory(category)}
- Date: ${moment(month).format('MMMM YYYY')}
- Location: ${location.street?.name ?? 'Unknown Street'}
- Outcome: ${crime.outcome_status ? formatCategory(crime.outcome_status.category) : 'No specific outcome'}

**Proximity Events (within ${proximityRadiusKm * 1000}m and +/- 1 month):**
${formattedNearbyCrimes.length > 0 ? `Nearby Crimes: ${JSON.stringify(formattedNearbyCrimes.slice(0, 5), null, 2)}` : 'No significant nearby crime incidents.'}
${formattedNearbyStopSearches.length > 0 ? `Nearby Stop & Searches: ${JSON.stringify(formattedNearbyStopSearches.slice(0, 5), null, 2)}` : 'No significant nearby stop and search incidents.'}

**Instructions for your Briefing Output (use Markdown):**
1.  **Incident Overview:** Summarize the core facts concisely using bullet points.
2.  **Detective's Insights (Likely Scenario):** Provide 2-3 concise, informed observations about the *likelihood of specific details* or *common patterns* for such incidents. Focus on what likely happened.
3.  **Proximity Analysis:** Briefly explain how nearby events relate to the main incident or highlight localized activity.

**Incident Briefing:**`;

    const responseData = await callAIApi({
        prompt: prompt,
        modelName: 'gemini-1.5-flash',
    });
    return responseData.text;
}

export async function generateStopSearchBriefing(
    stopSearch: StopSearch, 
    allCrimes: Crime[], 
    allStopSearches: StopSearch[]
): Promise<string> {
    const { datetime, location, outcome, object_of_search, type } = stopSearch;
    if (!location) return "Briefing not available: no location data for this incident.";

    const incidentLat = parseFloat(location.latitude);
    const incidentLng = parseFloat(location.longitude);
    if(isNaN(incidentLat) || isNaN(incidentLng)) return "Briefing not available due to invalid location data.";

    const { nearbyCrimes, proximityRadiusKm } = findNearbyEvents(incidentLat, incidentLng, datetime, allCrimes, allStopSearches);

    const formattedNearbyCrimes = nearbyCrimes.map(c => ({
        type: formatCategory(c.category),
        date: moment(c.month).format('MMMM YYYY'),
        street: c.location?.street?.name ?? 'Unknown Street'
    }));


    const prompt = `You are a highly experienced police analyst AI. Analyze a specific Stop and Search incident and provide a comprehensive briefing.

**Main Incident Details:**
- Type: ${type}
- Date & Time: ${moment(datetime).format('YYYY-MM-DD HH:mm')}
- Location: ${location.street?.name ?? 'Unknown Street'}
- Object of Search: ${object_of_search || 'N/A'}
- Outcome: ${outcome}

**Contextual Data (within ${proximityRadiusKm * 1000}m and +/- 1 month):**
${formattedNearbyCrimes.length > 0 ? `Nearby Crimes: ${JSON.stringify(formattedNearbyCrimes.slice(0, 5), null, 2)}` : 'No significant nearby crime incidents.'}

**Instructions for your Briefing Output (use Markdown):**
1.  **Incident Summary:** Summarize the core facts of the stop and search.
2.  **Analyst's Insights:** Provide 1-2 concise, informed observations. For example, does this stop align with local crime patterns? Was the outcome expected given the context?
3.  **Local Context:** Briefly explain how nearby crimes might relate to this policing activity.

**Analyst Briefing:**`;

    const responseData = await callAIApi({
        prompt: prompt,
        modelName: 'gemini-1.5-flash',
    });
    return responseData.text;
}


export async function summarizeCrimeTrends(crimes: Crime[]): Promise<string> {
    if (crimes.length === 0) {
        return "No crime data available to summarize.";
    }

    const crimeDataForLLM = crimes.slice(0, 100).map(crime => ({
        type: formatCategory(crime.category),
        date: moment(crime.month).format('MMMM YYYY'),
        street: crime.location?.street?.name ?? 'Unknown Street',
    }));

    const prompt = `Analyze the following crime incidents from Doncaster and provide a concise summary of the key trends observed. Use Markdown for formatting. Highlight:
- The most common crime types.
- Any notable locations or street-level patterns.
- Overall observations on recent activity.
    
Crime Incidents (Sample):
${JSON.stringify(crimeDataForLLM, null, 2)}

**Summary of Crime Trends:**`;
    
    const responseData = await callAIApi({
        prompt: prompt,
        modelName: 'gemini-1.5-flash',
    });
    return responseData.text;
}

export async function generateCrimeInsights(crimes: Crime[]): Promise<Insight[]> {
    if (crimes.length === 0) return [];

    const crimeDataForLLM = crimes.slice(0, 200).map(crime => ({
        type: formatCategory(crime.category),
        date: moment(crime.month).format('MMMM YYYY'),
        street: crime.location?.street?.name ?? 'Unknown Street',
    }));

    const prompt = `Analyze the crime data from Doncaster. Provide a JSON array of objects, where each object has an "area" (a street or general area) and an "insight" (a pattern, likelihood, or hotspot detail). Focus on hotspots, temporal patterns, and crime likelihood.
    
Example: [{ "area": "High Street", "insight": "Shows a consistent pattern of shoplifting..." }]

**Important:** Analyze *only* the provided data. Do not make inferences about residents.

Crime Incidents (Sample):
${JSON.stringify(crimeDataForLLM, null, 2)}

JSON Output:`;
    
    const responseData = await callAIApi({
        prompt: prompt,
        modelName: 'gemini-1.5-flash',
        jsonResponse: true,
    });
    return responseData.json || [];
}


export async function generatePredictiveHotspots(crimes: Crime[]): Promise<PredictiveHotspot[]> {
    if (crimes.length < 10) return [];

    const crimeDataForLLM = crimes.map(crime => ({
        type: formatCategory(crime.category),
        date: moment(crime.month).format('YYYY-MM'),
        street: crime.location?.street?.name ?? 'Unknown Street',
        latitude: parseFloat(crime.location.latitude),
        longitude: parseFloat(crime.location.longitude)
    }));

    const prompt = `Analyze recent crime incidents in Doncaster. Based on patterns, identify **exactly 3 to 5 distinct areas** likely to become future crime hotspots in the next 1-3 months. 
    
For each predicted hotspot, provide:
1.  A concise area description.
2.  The most likely crime type.
3.  A brief reason for the prediction.
4.  Estimated latitude and longitude, ensuring they are distinct and geographically varied.

Provide your predictions as a JSON array of objects with keys: "area", "latitude", "longitude", "predictedCrimeType", "reason".

Example: [{ "area": "High Street", "latitude": 53.525, "longitude": -1.130, "predictedCrimeType": "Shoplifting", "reason": "Consistent pattern of retail theft." }]

**Important:** Base predictions *only* on provided data. Do not make statements about individuals. Ensure coordinates are valid numbers.

Crime Incidents for Analysis:
${JSON.stringify(crimeDataForLLM, null, 2)}

JSON Output:`;

    const responseData = await callAIApi({
        prompt: prompt,
        modelName: 'gemini-1.5-flash',
        jsonResponse: true,
    });
    return responseData.json || [];
}
