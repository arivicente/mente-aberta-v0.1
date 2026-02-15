
import React from 'react';
import { Specialist } from '../types';

interface SpecialistCardProps {
  specialist: Specialist;
  isActive: boolean;
  onClick: () => void;
}

export const SpecialistCard: React.FC<SpecialistCardProps> = ({ specialist, isActive, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center p-5 rounded-2xl transition-all duration-200 w-full border ${
        isActive 
          ? 'bg-white border-[#4285F4] shadow-md ring-1 ring-[#4285F4]' 
          : 'bg-white border-[#DADCE0] hover:bg-[#F8F9FA] shadow-sm'
      }`}
    >
      <img 
        src={specialist.avatar} 
        alt={specialist.name} 
        className="w-14 h-14 rounded-full mb-4 object-cover border border-[#E8EAED]"
      />
      <div className="text-center">
        <h3 className="font-medium text-[#202124] text-sm">{specialist.name}</h3>
        <p className="text-[#1A73E8] text-[10px] font-bold uppercase tracking-wider mt-1">{specialist.approach}</p>
      </div>
    </button>
  );
};
