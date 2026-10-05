-- =====================================================================
-- 024 FEEDBACK TYPES & AUDIENCE CLEANUP:
-- Updates feedback routing notes and ensures feedback items can be
-- non-anonymous with direct reporting manager, HR, and Boss selection.
-- =====================================================================

comment on type public.feedback_type is 'Feedback post type: feedback, question (work/general), blocker';
comment on type public.feedback_audience is 'Audience options: manager (Reporting Manager), hr (HR), boss (Boss), all';
