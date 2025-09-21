
import { GoogleGenAI } from "@google/genai";
import { Crime, StopSearch, Insight, PredictiveHotspot } from '../types';
import moment from 'moment';

// Safely access the API key without crashing if process.env is not defined
const API_KEY = (globalThis as any).process?.env?.API_KEY;

// Conditionally initialize the AI client
const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

if (!ai) {
  console.warn("Gemini AI service is not configured. API_KEY is missing from environment variables. AI features will be disabled.");
}

function parseJsonResponse<T,>(text: string): T {
    let jsonStr = text.trim();
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
      jsonStr = match[2].trim();
    }
    try {
      return JSON.parse(jsonStr) as T;
    } catch (e) {
      console.error("Failed to parse JSON response:", e, "Raw text:", text);
      throw new Error("Failed to parse AI response as JSON.");
    }
}

const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export async function generateIncidentBriefing(
    crime: Crime, 
    allCrimes: Crime[], 
    allStopSearches: StopSearch[]
): Promise<string> {
    if (!ai) return Promise.resolve("AI service is not available (API key missing).");

    const { category, month, location } = crime;
    const crimeLat = parseFloat(location.latitude);
    const crimeLng = parseFloat(location.longitude);

    if(isNaN(crimeLat) || isNaN(crimeLng)) return "Briefing not available due to invalid location data.";

    const targetMoment = moment(month, 'YYYY-MM');
    const oneMonthBefore = targetMoment.clone().subtract(1, 'month');
    const oneMonthAfter = targetMoment.clone().add(1, 'month');
    const proximityRadiusKm = 0.25;

    const nearbyCrimes = allCrimes.filter(c => {
        if (!c.location?.latitude || !c.location?.longitude) return false;
        const cLat = parseFloat(c.location.latitude);
        const cLng = parseFloat(c.location.longitude);
        if(isNaN(cLat) || isNaN(cLng)) return false;
        const crimeMoment = moment(c.month);
        return haversineDistance(crimeLat, crimeLng, cLat, cLng) <= proximityRadiusKm &&
               crimeMoment.isBetween(oneMonthBefore, oneMonthAfter, undefined, '[]');
    }).map(c => ({
        type: c.category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        date: moment(c.month).format('MMMM YYYY'),
        street: c.location?.street?.name ?? 'Unknown Street'
    }));

    const nearbyStopSearches = allStopSearches.filter(ss => {
        if (!ss.location?.latitude || !ss.location?.longitude) return false;
        const ssLat = parseFloat(ss.location.latitude);
        const ssLng = parseFloat(ss.location.longitude);
        if(isNaN(ssLat) || isNaN(ssLng)) return false;
        const ssMoment = moment(ss.datetime);
        return haversineDistance(crimeLat, crimeLng, ssLat, ssLng) <= proximityRadiusKm &&
               ssMoment.isBetween(oneMonthBefore, oneMonthAfter, undefined, '[]');
    }).map(ss => ({
        type: ss.type || 'N/A',
        date: moment(ss.datetime).format('YYYY-MM-DD HH:mm'),
        objectOfSearch: ss.object_of_search || 'N/A',
        street: ss.location?.street?.name ?? 'Unknown Street'
    }));

    const prompt = `You are a highly experienced detective AI. Analyze a specific crime incident and provide a comprehensive incident briefing. Combine factual context, insightful deductions about what likely happened, and relevant proximity event data.

**Main Incident Details:**
- Crime Type: ${category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
- Date: ${moment(month).format('MMMM YYYY')}
- Location: ${location.street.name}
- Outcome: ${crime.outcome_status?.category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) ?? 'No specific outcome'}

**Proximity Events (within ${proximityRadiusKm * 1000}m and +/- 1 month):**
${nearbyCrimes.length > 0 ? `Nearby Crimes: ${JSON.stringify(nearbyCrimes.slice(0, 5), null, 2)}` : 'No significant nearby crime incidents.'}
${nearbyStopSearches.length > 0 ? `Nearby Stop & Searches: ${JSON.stringify(nearbyStopSearches.slice(0, 5), null, 2)}` : 'No significant nearby stop and search incidents.'}

**Instructions for your Briefing Output (use Markdown):**
1.  **Incident Overview:** Summarize the core facts concisely using bullet points.
2.  **Detective's Insights (Likely Scenario):** Provide 2-3 concise, informed observations about the *likelihood of specific details* or *common patterns* for such incidents. Focus on what likely happened.
3.  **Proximity Analysis:** Briefly explain how nearby events relate to the main incident or highlight localized activity.

**Incident Briefing:**`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-04-17',
        contents: prompt,
    });
    return response.text;
}

export async function generateStopSearchBriefing(
    stopSearch: StopSearch, 
    allCrimes: Crime[], 
    allStopSearches: StopSearch[]
): Promise<string> {
    if (!ai) return Promise.resolve("AI service is not available (API key missing).");
    const { datetime, location, outcome, object_of_search, type } = stopSearch;
    if (!location) return "Briefing not available: no location data for this incident.";

    const incidentLat = parseFloat(location.latitude);
    const incidentLng = parseFloat(location.longitude);
    if(isNaN(incidentLat) || isNaN(incidentLng)) return "Briefing not available due to invalid location data.";

    const targetMoment = moment(datetime);
    const oneMonthBefore = targetMoment.clone().subtract(1, 'month');
    const oneMonthAfter = targetMoment.clone().add(1, 'month');
    const proximityRadiusKm = 0.25;
    
    const nearbyCrimes = allCrimes.filter(c => {
        if (!c.location?.latitude || !c.location?.longitude) return false;
        const cLat = parseFloat(c.location.latitude);
        const cLng = parseFloat(c.location.longitude);
        if(isNaN(cLat) || isNaN(cLng)) return false;
        const crimeMoment = moment(c.month);
        return haversineDistance(incidentLat, incidentLng, cLat, cLng) <= proximityRadiusKm &&
               crimeMoment.isBetween(oneMonthBefore, oneMonthAfter, undefined, '[]');
    }).map(c => ({
        type: c.category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        date: moment(c.month).format('MMMM YYYY'),
        street: c.location?.street?.name ?? 'Unknown Street'
    }));

    const prompt = `You are a highly experienced police analyst AI. Analyze a specific Stop and Search incident and provide a comprehensive briefing.

**Main Incident Details:**
- Type: ${type}
- Date & Time: ${moment(datetime).format('YYYY-MM-DD HH:mm')}
- Location: ${location.street.name}
- Object of Search: ${object_of_search || 'N/A'}
- Outcome: ${outcome}

**Contextual Data (within ${proximityRadiusKm * 1000}m and +/- 1 month):**
${nearbyCrimes.length > 0 ? `Nearby Crimes: ${JSON.stringify(nearbyCrimes.slice(0, 5), null, 2)}` : 'No significant nearby crime incidents.'}

**Instructions for your Briefing Output (use Markdown):**
1.  **Incident Summary:** Summarize the core facts of the stop and search.
2.  **Analyst's Insights:** Provide 1-2 concise, informed observations. For example, does this stop align with local crime patterns? Was the outcome expected given the context?
3.  **Local Context:** Briefly explain how nearby crimes might relate to this policing activity.

**Analyst Briefing:**`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-04-17',
        contents: prompt,
    });
    return response.text;
}


export async function summarizeCrimeTrends(crimes: Crime[]): Promise<string> {
    if (!ai) return Promise.resolve("AI service is not available (API key missing).");
    if (crimes.length === 0) {
        return "No crime data available to summarize.";
    }

    const crimeDataForLLM = crimes.slice(0, 100).map(crime => ({
        type: crime.category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
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
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-04-17',
        contents: prompt,
    });
    return response.text;
}

export async function generateCrimeInsights(crimes: Crime[]): Promise<Insight[]> {
    if (!ai) return Promise.resolve([]);
    if (crimes.length === 0) return [];

    const crimeDataForLLM = crimes.slice(0, 200).map(crime => ({
        type: crime.category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        date: moment(crime.month).format('MMMM YYYY'),
        street: crime.location?.street?.name ?? 'Unknown Street',
    }));

    const prompt = `Analyze the crime data from Doncaster. Provide a JSON array of objects, where each object has an "area" (a street or general area) and an "insight" (a pattern, likelihood, or hotspot detail). Focus on hotspots, temporal patterns, and crime likelihood.
    
Example: [{ "area": "High Street", "insight": "Shows a consistent pattern of shoplifting..." }]

**Important:** Analyze *only* the provided data. Do not make inferences about residents.

Crime Incidents (Sample):
${JSON.stringify(crimeDataForLLM, null, 2)}

JSON Output:`;
    
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-04-17",
        contents: prompt,
        config: { responseMimeType: "application/json" }
    });
    
    return parseJsonResponse<Insight[]>(response.text);
}


export async function generatePredictiveHotspots(crimes: Crime[]): Promise<PredictiveHotspot[]> {
    if (!ai) return Promise.resolve([]);
    if (crimes.length < 10) return [];

    const crimeDataForLLM = crimes.map(crime => ({
        type: crime.category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
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

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-04-17",
        contents: prompt,
        config: { responseMimeType: "application/json" }
    });

    return parseJsonResponse<PredictiveHotspot[]>(response.text);
}