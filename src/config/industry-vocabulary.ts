export interface IndustryVocabulary {
  resourceLabel: string;
  customerLabel: string;
  serviceLabel: string;
  statusInProgress: string;
}

export const INDUSTRY_VOCABULARY: Record<string, IndustryVocabulary> = {
  HEALTHCARE: {
    resourceLabel: 'Doctor / Specialist',
    customerLabel: 'Patient',
    serviceLabel: 'Consultation / Checkup',
    statusInProgress: 'In Consultation',
  },
  SALON_WELLNESS: {
    resourceLabel: 'Stylist / Therapist',
    customerLabel: 'Client',
    serviceLabel: 'Treatment / Haircut',
    statusInProgress: 'In Chair',
  },
  LEGAL_CONSULTING: {
    resourceLabel: 'Attorney / Advisor',
    customerLabel: 'Client',
    serviceLabel: 'Strategy Session',
    statusInProgress: 'In Session',
  },
  REAL_ESTATE: {
    resourceLabel: 'Listing Agent',
    customerLabel: 'Buyer / Lead',
    serviceLabel: 'Property Viewing',
    statusInProgress: 'Showing Property',
  },
  AUTOMOTIVE: {
    resourceLabel: 'Mechanic / Bay',
    customerLabel: 'Vehicle Owner',
    serviceLabel: 'Vehicle Maintenance',
    statusInProgress: 'In Service Bay',
  },
  FITNESS: {
    resourceLabel: 'Personal Trainer',
    customerLabel: 'Member',
    serviceLabel: 'Training Session',
    statusInProgress: 'In Session',
  },
  GENERAL: {
    resourceLabel: 'Staff Member',
    customerLabel: 'Customer',
    serviceLabel: 'Appointment',
    statusInProgress: 'In Progress',
  },
};

export function getVocabulary(industry: string = 'GENERAL'): IndustryVocabulary {
  return INDUSTRY_VOCABULARY[industry] || INDUSTRY_VOCABULARY.GENERAL;
}
