
import React, { useState, useEffect, useCallback, useMemo, useReducer } from 'react';
import { Crime, StopSearch, CrimeCategory, Insight, PredictiveHotspot, ModalState, SortConfig } from './types';
import * as policeApi from './services/policeApi';
import * as geminiService from './services/geminiService';
import CrimeMap from './components/CrimeMap';
import Modal from './components/Modal';
import CollapsibleSection from './components/CollapsibleSection';
import moment from 'moment';

const getNestedValue = (obj: any, path: string): any => {
    if (!path) return obj;
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};

const ActionButton: React.FC<{ onClick?: () => void; children: React.ReactNode; disabled?: boolean; className?: string }> = ({ onClick, children, disabled, className }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`rounded-md p-2 px-3 font-semibold shadow-sm transition-all duration-150 inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm text-foreground bg-primary hover:bg-primary-focus disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
        {children}
    </button>
);

type ModalAction =
    | { type: 'OPEN_MODAL'; payload: { modal: keyof ModalState; content?: React.ReactNode } }
    | { type: 'CLOSE_MODAL' }
    | { type: 'SET_LOADING'; payload: boolean }
    | { type: 'SET_CONTENT'; payload: React.ReactNode };

const initialModalState: { modal: ModalState; content: React.ReactNode; isLoading: boolean } = {
    modal: { briefing: false, trend: false, insights: false, predictive: false },
    content: '',
    isLoading: false,
};

function modalReducer(state: typeof initialModalState, action: ModalAction) {
    switch (action.type) {
        case 'OPEN_MODAL':
            return { ...state, modal: { ...initialModalState.modal, [action.payload.modal]: true }, isLoading: true, content: action.payload.content || '' };
        case 'CLOSE_MODAL':
            return { ...state, modal: initialModalState.modal };
        case 'SET_LOADING':
            return { ...state, isLoading: action.payload };
        case 'SET_CONTENT':
            return { ...state, content: action.payload, isLoading: false };
        default: return state;
    }
}

const stopSearchHeaders = [
    { label: 'Date', key: 'datetime' },
    { label: 'Type', key: 'type' },
    { label: 'Object', key: 'object_of_search' },
    { label: 'Gender', key: 'gender' },
    { label: 'Age', key: 'age_range' },
    { label: 'Ethnicity', key: 'self_defined_ethnicity' },
    { label: 'Outcome', key: 'outcome' },
    { label: 'Street', key: 'location.street.name' },
];

const App: React.FC = () => {
    const [allCrimes, setAllCrimes] = useState<Crime[]>([]);
    const [filteredCrimes, setFilteredCrimes] = useState<Crime[]>([]);
    const [allStopSearches, setAllStopSearches] = useState<StopSearch[]>([]);
    const [crimeCategories, setCrimeCategories] = useState<CrimeCategory[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [selectedCrimeId, setSelectedCrimeId] = useState<string | null>(null);
    const [selectedStopSearch, setSelectedStopSearch] = useState<StopSearch | null>(null);
    
    const [notification, setNotification] = useState('Initializing...');
    const [isLoading, setIsLoading] = useState(true);

    const [isDensityHeatmapVisible, setDensityHeatmapVisible] = useState(true);
    const [isRecencyHeatmapVisible, setRecencyHeatmapVisible] = useState(false);
    const [isInsightsVisible, setInsightsVisible] = useState(false);
    const [isPredictiveHotspotsVisible, setPredictiveHotspotsVisible] = useState(false);

    const [insights, setInsights] = useState<Insight[]>([]);
    const [predictiveHotspots, setPredictiveHotspots] = useState<PredictiveHotspot[]>([]);
    
    const [modal, dispatchModal] = useReducer(modalReducer, initialModalState);
    
    const [crimeSortConfig, setCrimeSortConfig] = useState<SortConfig>({ key: 'month', direction: 'desc' });
    const [stopSearchSortConfig, setStopSearchSortConfig] = useState<SortConfig>({ key: 'datetime', direction: 'desc' });

    const handleItemSelection = useCallback((type: 'crime' | 'stopSearch' | null, item?: Crime | StopSearch) => {
        if (type === 'crime' && item) {
            setSelectedCrimeId((item as Crime).persistent_id || String((item as Crime).id));
            setSelectedStopSearch(null);
        } else if (type === 'stopSearch' && item) {
            setSelectedStopSearch(item as StopSearch);
            setSelectedCrimeId(null);
        } else { // This handles the null case for deselection
            setSelectedCrimeId(null);
            setSelectedStopSearch(null);
        }
        if (item) {
            document.getElementById('map-wrapper')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, []);

    // Fetch static categories once on component mount
    useEffect(() => {
        const getCategories = async () => {
            const categories = await policeApi.fetchCrimeCategories();
            setCrimeCategories(categories);
        };
        getCategories();
    }, []);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setNotification('Fetching latest data...');
        const dates = await policeApi.getAvailableCrimeDates();
        if (dates.length === 0) {
            setNotification('No recent data available from Police API.');
            setIsLoading(false);
            return;
        }

        const [crimes, stopSearches] = await Promise.all([
            policeApi.fetchCrimeData(dates),
            policeApi.fetchStopAndSearchData(dates)
        ]);

        setAllCrimes(crimes);
        setAllStopSearches(stopSearches);
        setNotification(`Updated! Data from ${moment(dates[dates.length - 1]).format('MMMM YYYY')} to ${moment(dates[0]).format('MMMM YYYY')}.`);
        setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 300000); // Update every 5 minutes
        return () => clearInterval(interval);
    }, [fetchData]);

    useEffect(() => {
        let newFilteredCrimes = allCrimes;
        if (selectedCategory !== 'all') {
            newFilteredCrimes = allCrimes.filter(crime => crime.category === selectedCategory);
        }
        setFilteredCrimes(newFilteredCrimes);
    }, [allCrimes, selectedCategory]);

    const handleAIFeature = useCallback(async (
        modalKey: keyof ModalState,
        apiCall: () => Promise<any>,
        onSuccess: (data: any) => React.ReactNode
    ) => {
        dispatchModal({ type: 'OPEN_MODAL', payload: { modal: modalKey } });
        try {
            const result = await apiCall();
            dispatchModal({ type: 'SET_CONTENT', payload: onSuccess(result) });
        } catch (e) {
            const message = e instanceof Error ? e.message : 'An unknown error occurred.';
            dispatchModal({ type: 'SET_CONTENT', payload: <div className="text-red-400">{message}</div> });
        }
    }, []);

    const handleSummarizeTrends = useCallback(() => handleAIFeature(
        'trend',
        () => geminiService.summarizeCrimeTrends(filteredCrimes),
        (summary) => <div dangerouslySetInnerHTML={{ __html: summary.replace(/\n/g, '<br/>') }} />
    ), [handleAIFeature, filteredCrimes]);

    const handleGenerateInsights = useCallback(() => handleAIFeature(
        'insights',
        () => geminiService.generateCrimeInsights(filteredCrimes),
        (insightData: Insight[]) => {
            setInsights(insightData);
            setInsightsVisible(true);
            return insightData.length > 0 ?
                <ul className="list-disc pl-5">{insightData.map((item, i) => <li key={i}><strong>{item.area}:</strong> {item.insight}</li>)}</ul> :
                'No insights could be generated from the current data.';
        }
    ), [handleAIFeature, filteredCrimes]);

    const handleGeneratePredictiveHotspots = useCallback(() => handleAIFeature(
        'predictive',
        () => geminiService.generatePredictiveHotspots(allCrimes),
        (hotspotData: PredictiveHotspot[]) => {
            setPredictiveHotspots(hotspotData);
            setPredictiveHotspotsVisible(true);
            return hotspotData.length > 0 ?
                <ul className="list-disc pl-5">{hotspotData.map((item, i) => <li key={i}><strong>{item.area} ({item.predictedCrimeType}):</strong> {item.reason}</li>)}</ul> :
                'No predictive hotspots could be generated.';
        }
    ), [handleAIFeature, allCrimes]);
    
    const closeModal = () => dispatchModal({ type: 'CLOSE_MODAL' });

    const sortedCrimes = useMemo(() => {
        return [...filteredCrimes].sort((a, b) => {
            const valA = crimeSortConfig.key === 'month' ? moment(a.month).valueOf() : a.category;
            const valB = crimeSortConfig.key === 'month' ? moment(b.month).valueOf() : b.category;
            if (valA < valB) return crimeSortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return crimeSortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredCrimes, crimeSortConfig]);

    const sortedStopSearches = useMemo(() => {
        return [...allStopSearches].sort((a, b) => {
            const valA = getNestedValue(a, stopSearchSortConfig.key) || '';
            const valB = getNestedValue(b, stopSearchSortConfig.key) || '';
            if (valA < valB) return stopSearchSortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return stopSearchSortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [allStopSearches, stopSearchSortConfig]);

    const handleCrimeSort = (key: string) => {
        setCrimeSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
    };
    
    const handleStopSearchSort = (key: string) => {
        setStopSearchSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
    };

    return (
        <div className="container mx-auto bg-background text-foreground p-2 sm:p-4 rounded-lg shadow-2xl max-w-7xl">
            {/* Header */}
            <header className="flex flex-col sm:flex-row justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                    <svg className="w-10 h-10 sm:w-12 sm:h-12 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    <h1 className="text-2xl sm:text-4xl font-bold text-foreground">Doncaster Crime Activity</h1>
                </div>
            </header>

            {/* Notification and Update */}
            <div className="flex flex-col md:flex-row items-center justify-between mb-4 p-2 bg-muted/20 rounded-lg shadow-md">
                <div className="font-semibold text-xs mb-2 md:mb-0 text-foreground/80">{notification}</div>
                <ActionButton onClick={fetchData} disabled={isLoading}>Update Now</ActionButton>
            </div>
            
            {/* Controls */}
            <div className="mb-4">
                <label htmlFor="crimeCategoryFilter" className="block text-sm font-medium mb-1 text-foreground/80">Filter by Crime Category:</label>
                <select id="crimeCategoryFilter" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="block w-full pl-3 pr-10 py-2 text-base border-muted focus:outline-none focus:ring-primary focus:border-primary sm:text-sm rounded-md bg-muted text-foreground shadow-sm">
                    <option value="all">All Categories</option>
                    {crimeCategories.map(cat => <option key={cat.url} value={cat.url}>{cat.name}</option>)}
                </select>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
                <ActionButton onClick={handleSummarizeTrends}>✨ Summarize</ActionButton>
                <ActionButton onClick={() => { setDensityHeatmapVisible(!isDensityHeatmapVisible); if(!isDensityHeatmapVisible) setRecencyHeatmapVisible(false); }} className={isDensityHeatmapVisible ? 'active-glow' : ''}>{isDensityHeatmapVisible ? 'Hide Density' : 'Show Density'}</ActionButton>
                <ActionButton onClick={() => { setRecencyHeatmapVisible(!isRecencyHeatmapVisible); if(!isRecencyHeatmapVisible) setDensityHeatmapVisible(false); }} className={isRecencyHeatmapVisible ? 'active-glow' : ''}>{isRecencyHeatmapVisible ? 'Hide Recency' : 'Show Recency'}</ActionButton>
                <ActionButton onClick={() => { insights.length > 0 ? setInsightsVisible(!isInsightsVisible) : handleGenerateInsights(); }} className={isInsightsVisible ? 'active-glow' : ''}>{isInsightsVisible ? 'Hide Insights' : 'Show Insights'}</ActionButton>
                <ActionButton onClick={() => { predictiveHotspots.length > 0 ? setPredictiveHotspotsVisible(!isPredictiveHotspotsVisible) : handleGeneratePredictiveHotspots(); }} className={`${isPredictiveHotspotsVisible ? 'active-glow' : ''} ${modal.isLoading && modal.modal.predictive ? 'predictive-generating' : ''}`}>{isPredictiveHotspotsVisible ? 'Hide Hotspots' : '🔮 Predict'}</ActionButton>
            </div>

            {/* Map */}
            <div id="map-wrapper">
                <CrimeMap 
                    crimes={filteredCrimes} 
                    insights={insights}
                    predictiveHotspots={predictiveHotspots}
                    isDensityHeatmapVisible={isDensityHeatmapVisible}
                    isRecencyHeatmapVisible={isRecencyHeatmapVisible}
                    isInsightsVisible={isInsightsVisible}
                    isPredictiveHotspotsVisible={isPredictiveHotspotsVisible}
                    onCrimeSelect={handleItemSelection}
                    selectedCrimeId={selectedCrimeId}
                    selectedStopSearch={selectedStopSearch}
                    allCrimes={allCrimes}
                    allStopSearches={allStopSearches}
                />
            </div>

            {/* Modals */}
            <Modal isOpen={modal.modal.trend} onClose={closeModal} title="Crime Trend Summary">
                {modal.isLoading ? <div className="loading-spinner"></div> : modal.content}
            </Modal>
            <Modal isOpen={modal.modal.insights} onClose={closeModal} title="Crime Insights & Analysis">
                 {modal.isLoading ? <div className="loading-spinner"></div> : modal.content}
            </Modal>
            <Modal isOpen={modal.modal.predictive} onClose={closeModal} title="Predictive Crime Hotspots">
                 {modal.isLoading ? <div className="loading-spinner"></div> : modal.content}
            </Modal>

            {/* Crime List */}
            <CollapsibleSection title="Recent Crime Incidents">
                <div className="overflow-x-auto rounded-lg shadow-md border border-muted/20">
                    <table className="min-w-full divide-y divide-muted/20 text-sm">
                        <thead className="bg-muted/20">
                            <tr>
                                <th onClick={() => handleCrimeSort('month')} className="cursor-pointer p-3 text-left text-xs font-medium text-foreground/80 uppercase tracking-wider">Date {crimeSortConfig.key === 'month' && (crimeSortConfig.direction === 'asc' ? '▲' : '▼')}</th>
                                <th onClick={() => handleCrimeSort('category')} className="cursor-pointer p-3 text-left text-xs font-medium text-foreground/80 uppercase tracking-wider">Type {crimeSortConfig.key === 'category' && (crimeSortConfig.direction === 'asc' ? '▲' : '▼')}</th>
                            </tr>
                        </thead>
                        <tbody className="bg-background divide-y divide-muted/20">
                            {sortedCrimes.map(crime => {
                                const crimeId = crime.persistent_id || String(crime.id);
                                return (
                                    <tr 
                                        key={crimeId} 
                                        className={`hover:bg-muted/20 cursor-pointer ${(selectedCrimeId === crimeId) ? 'table-row-highlighted' : ''}`}
                                        onClick={() => handleItemSelection('crime', crime)}
                                    >
                                        <td className="p-3 whitespace-nowrap">{moment(crime.month).format("MMMM YYYY")}</td>
                                        <td className="p-3 whitespace-nowrap">{crime.category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </CollapsibleSection>

            {/* Stop & Search List */}
            <CollapsibleSection title="Recent Stop & Search Incidents">
                <div className="overflow-x-auto rounded-lg shadow-md border border-muted/20">
                    <table className="min-w-full divide-y divide-muted/20 text-sm">
                         <thead className="bg-muted/20">
                            <tr>
                                {stopSearchHeaders.map(header => (
                                    <th 
                                        key={header.key} 
                                        onClick={() => handleStopSearchSort(header.key)}
                                        className="cursor-pointer p-3 text-left text-xs font-medium text-foreground/80 uppercase tracking-wider"
                                    >
                                        {header.label} {stopSearchSortConfig.key === header.key && (stopSearchSortConfig.direction === 'asc' ? '▲' : '▼')}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-background divide-y divide-muted/20">
                            {sortedStopSearches.slice(0, 50).map((event, i) => (
                                <tr 
                                    key={`${event.datetime}-${i}`}
                                    className="hover:bg-muted/20 cursor-pointer" 
                                    onClick={() => handleItemSelection('stopSearch', event)}
                                >
                                    <td className="p-3 whitespace-nowrap">{moment(event.datetime).format('YYYY-MM-DD HH:mm')}</td>
                                    <td className="p-3 whitespace-nowrap">{event.type || 'N/A'}</td>
                                    <td className="p-3 whitespace-nowrap">{event.object_of_search || 'N/A'}</td>
                                    <td className="p-3 whitespace-nowrap">{event.gender || 'N/A'}</td>
                                    <td className="p-3 whitespace-nowrap">{event.age_range || 'N/A'}</td>
                                    <td className="p-3 whitespace-nowrap">{event.self_defined_ethnicity || event.officer_defined_ethnicity || 'N/A'}</td>
                                    <td className="p-3 whitespace-nowrap">{event.outcome || 'N/A'}</td>
                                    <td className="p-3 whitespace-nowrap">{getNestedValue(event, 'location.street.name') || 'N/A'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </CollapsibleSection>
        </div>
    );
};

export default App;