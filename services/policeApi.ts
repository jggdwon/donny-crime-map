
import { Crime, StopSearch, CrimeCategory } from '../types';
import moment from 'moment';

const API_BASE_URL = 'https://data.police.uk/api';
const DONCASTER_LAT = 53.522820;
const DONCASTER_LNG = -1.128462;

export async function getAvailableCrimeDates(): Promise<string[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/crimes-street-dates`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    
    // Sort all available dates descending
    const sortedDates = data
      .map((item: { date: string }) => item.date)
      .sort((a: string, b: string) => moment(b).diff(moment(a)));
      
    // Return the 6 most recent months to ensure data freshness
    return sortedDates.slice(0, 6);

  } catch (error) {
    console.error("Error fetching available crime dates:", error);
    return [];
  }
}

export async function fetchCrimeCategories(): Promise<CrimeCategory[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/crime-categories`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error("Error fetching crime categories:", error);
    return [];
  }
}

export async function fetchCrimeData(dates: string[]): Promise<Crime[]> {
    const promises = dates.map(date =>
        fetch(`${API_BASE_URL}/crimes-street/all-crime?lat=${DONCASTER_LAT}&lng=${DONCASTER_LNG}&date=${date}`)
            .then(res => res.ok ? res.json() : (console.warn(`Failed to fetch crime data for ${date}`), []))
            .catch(err => (console.error(`Error fetching crime data for ${date}:`, err), []))
    );
    const results = await Promise.all(promises);
    return results.flat().filter(crime => crime.location?.latitude && crime.location?.longitude && crime.location.street);
}

export async function fetchStopAndSearchData(dates: string[]): Promise<StopSearch[]> {
    const promises = dates.map(date =>
        fetch(`${API_BASE_URL}/stops-street?lat=${DONCASTER_LAT}&lng=${DONCASTER_LNG}&date=${date}`)
            .then(res => res.ok ? res.json() : (console.warn(`Failed to fetch stop/search data for ${date}`), []))
            .catch(err => (console.error(`Error fetching stop/search data for ${date}:`, err), []))
    );
    const results = await Promise.all(promises);
    return results.flat();
}
