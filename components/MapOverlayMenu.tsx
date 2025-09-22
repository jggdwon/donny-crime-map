import React, { useState } from 'react';
import { Crime, StopSearch, CrimeCategory, Insight, PredictiveHotspot, ModalState, SortConfig } from '../types';
import CollapsibleSection from './CollapsibleSection';
import moment from 'moment';
import { stopSearchHeaders } from '../constants';

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

interface MapOverlayMenuProps {
    notification: string;
    isLoading: boolean;
    fetchData: () => void;
    selectedCategory: string;
    setSelectedCategory: (category: string) => void;
    crimeCategories: CrimeCategory[];
    handleSummarizeTrends: () => void;
    isDensityHeatmapVisible: boolean;
    setDensityHeatmapVisible: (visible: boolean) => void;
    isRecencyHeatmapVisible: boolean;
    setRecencyHeatmapVisible: (visible: boolean) => void;
    isInsightsVisible: boolean;
    setInsightsVisible: (visible: boolean) => void;
    handleGenerateInsights: () => void;
    predictiveHotspots: PredictiveHotspot[];
    isPredictiveHotspotsVisible: boolean;
    setPredictiveHotspotsVisible: (visible: boolean) => void;
    handleGeneratePredictiveHotspots: () => void;
    modal: { modal: ModalState; content: React.ReactNode; isLoading: boolean };
    sortedCrimes: Crime[];
    crimeSortConfig: SortConfig;
    handleCrimeSort: (key: string) => void;
    handleItemSelection: (type: 'crime' | 'stopSearch' | null, item?: Crime | StopSearch) => void;
    selectedCrimeId: string | null;
    sortedStopSearches: StopSearch[];
    stopSearchSortConfig: SortConfig;
    handleStopSearchSort: (key: string) => void;
    selectedStopSearch: StopSearch | null;
}

const MapOverlayMenu: React.FC<MapOverlayMenuProps> = ({
    notification,
    isLoading,
    fetchData,
    selectedCategory,
    setSelectedCategory,
    crimeCategories,
    handleSummarizeTrends,
    isDensityHeatmapVisible,
    setDensityHeatmapVisible,
    isRecencyHeatmapVisible,
    setRecencyHeatmapVisible,
    isInsightsVisible,
    setInsightsVisible,
    handleGenerateInsights,
    predictiveHotspots,
    isPredictiveHotspotsVisible,
    setPredictiveHotspotsVisible,
    handleGeneratePredictiveHotspots,
    modal,
    sortedCrimes,
    crimeSortConfig,
    handleCrimeSort,
    handleItemSelection,
    selectedCrimeId,
    sortedStopSearches,
    stopSearchSortConfig,
    handleStopSearchSort,
    selectedStopSearch,
}) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="fixed top-4 left-4 z-10">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="bg-primary text-foreground p-3 rounded-full shadow-lg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-75"
            >
                {isOpen ? '✕' : '☰'}
            </button>

            <div className={`absolute top-0 left-0 bg-background/90 backdrop-blur-md p-4 rounded-lg shadow-xl transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} w-80 max-h-[90vh] overflow-y-auto`}>
                {/* Notification and Update */}
                <div className="flex flex-col items-center justify-between mb-4 p-2 bg-muted/20 rounded-lg shadow-md">
                    <div className="font-semibold text-xs mb-2 text-foreground/80">{notification}</div>
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

                <div className="grid grid-cols-2 gap-2 mb-4">
                    <ActionButton onClick={handleSummarizeTrends}>✨ Summarize</ActionButton>
                    <ActionButton onClick={() => { setDensityHeatmapVisible(!isDensityHeatmapVisible); if(!isDensityHeatmapVisible) setRecencyHeatmapVisible(false); }} className={isDensityHeatmapVisible ? 'active-glow' : ''}>{isDensityHeatmapVisible ? 'Hide Density' : 'Show Density'}</ActionButton>
                    <ActionButton onClick={() => { setRecencyHeatmapVisible(!isRecencyHeatmapVisible); if(!isRecencyHeatmapVisible) setDensityHeatmapVisible(false); }} className={isRecencyHeatmapVisible ? 'active-glow' : ''}>{isRecencyHeatmapVisible ? 'Hide Recency' : 'Show Recency'}</ActionButton>
                    <ActionButton onClick={() => { insights.length > 0 ? setInsightsVisible(!isInsightsVisible) : handleGenerateInsights(); }} className={isInsightsVisible ? 'active-glow' : ''}>{isInsightsVisible ? 'Hide Insights' : 'Show Insights'}</ActionButton>
                    <ActionButton onClick={() => { predictiveHotspots.length > 0 ? setPredictiveHotspotsVisible(!isPredictiveHotspotsVisible) : handleGeneratePredictiveHotspots(); }} className={`${isPredictiveHotspotsVisible ? 'active-glow' : ''} ${modal.isLoading && modal.modal.predictive ? 'predictive-generating' : ''}`}>{isPredictiveHotspotsVisible ? 'Hide Hotspots' : '🔮 Predict'}</ActionButton>
                </div>

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
        </div>
    );
};

export default MapOverlayMenu;
