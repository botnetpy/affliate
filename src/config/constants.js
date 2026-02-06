module.exports = {
    COMMISSION_TIER_1_RATE: 0.10,  // 10% for first 50 referrals
    COMMISSION_TIER_2_RATE: 0.20,  // 20% after 50 referrals
    COMMISSION_TIER_THRESHOLD: 50,  // Number of referrals before tier 2
    REFERRAL_CODE_LENGTH: 8,
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
    AFFILIATE_STATUSES: ['pending', 'approved', 'rejected', 'suspended'],
    REFERRAL_STATUSES: ['signed_up', 'paid'],
    PAYOUT_STATUSES: ['pending', 'processing', 'completed', 'failed'],
};
