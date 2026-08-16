/**
 * Student catalog visibility & research inclusion helpers.
 * Craft tiers: gold / pilot shown to students; draft hidden.
 * observe-only stays published but is tagged for UI grouping.
 */

const STUDENT_CRAFT_OK = new Set(['craft:gold', 'craft:pilot']);

function sampleTagsOf(item) {
  return Array.isArray(item?.sampleTags) ? item.sampleTags : [];
}

function craftTier(item) {
  const tags = sampleTagsOf(item);
  if (tags.includes('craft:gold')) return 'gold';
  if (tags.includes('craft:pilot')) return 'pilot';
  if (tags.includes('craft:draft')) return 'draft';
  return null;
}

function isObserveOnly(item) {
  return sampleTagsOf(item).includes('observe-only');
}

/** Explicit researchInclude wins; else default false for observe-only, true otherwise. */
function isResearchInclude(item) {
  if (item && typeof item.researchInclude === 'boolean') return item.researchInclude;
  if (isObserveOnly(item)) return false;
  return true;
}

/**
 * Student-visible: published + (gold|pilot|no craft tag).
 * Draft craft is hidden. observe-only gold/pilot remain visible.
 * Items with no craft:* tag stay visible (legacy teacher publishes).
 */
function isStudentVisibleItem(item) {
  if (!item || !item.published) return false;
  const tags = sampleTagsOf(item);
  const hasCraft = tags.some((t) => String(t).startsWith('craft:'));
  if (!hasCraft) return true;
  return tags.some((t) => STUDENT_CRAFT_OK.has(t));
}

function filterStudentCatalog(items) {
  return (items || []).filter(isStudentVisibleItem);
}

module.exports = {
  craftTier,
  isObserveOnly,
  isResearchInclude,
  isStudentVisibleItem,
  filterStudentCatalog,
  STUDENT_CRAFT_OK,
};
