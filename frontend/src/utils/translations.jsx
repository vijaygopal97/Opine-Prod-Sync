import React from 'react';

/**
 * Translation utility functions
 * Handles parsing and displaying translations in the format: "Main Text {Translation}"
 */

/**
 * Parse text with translation format: "Main Text {Translation}"
 * Returns an object with mainText and translation
 * @param {string} text - Text that may contain translation in curly braces
 * @returns {object} - { mainText: string, translation: string|null }
 */
export const parseTranslation = (text) => {
  if (!text || typeof text !== 'string') {
    return { mainText: text || '', translation: null };
  }

  // Match pattern: text {translation}
  const translationRegex = /^(.+?)\s*\{([^}]+)\}\s*$/;
  const match = text.match(translationRegex);

  if (match) {
    return {
      mainText: match[1].trim(),
      translation: match[2].trim()
    };
  }

  return {
    mainText: text.trim(),
    translation: null
  };
};

/**
 * Get main text without translation (for CSV exports, etc.)
 * @param {string} text - Text that may contain translation
 * @returns {string} - Main text without translation
 */
export const getMainText = (text) => {
  const parsed = parseTranslation(text);
  return parsed.mainText;
};

/**
 * Render text with translation for display
 * Returns JSX element showing main text and translation if available
 * @param {string} text - Text that may contain translation
 * @param {object} options - Display options
 * @param {string} options.translationClass - CSS class for translation text
 * @param {string} options.mainClass - CSS class for main text
 * @param {string} options.separator - Separator between main and translation
 * @returns {JSX.Element} - React element
 */
export const renderWithTranslation = (text, options = {}) => {
  const {
    translationClass = 'text-sm text-gray-500 italic',
    mainClass = '',
    separator = ' / '
  } = options;

  const { mainText, translation } = parseTranslation(text);

  if (!translation) {
    return <span className={mainClass}>{mainText}</span>;
  }

  return (
    <span className={mainClass}>
      <span>{mainText}</span>
      <span className={translationClass}>
        {separator}{translation}
      </span>
    </span>
  );
};

/**
 * Render text with translation in a professional format (for modals)
 * Shows main text on one line and translation below in smaller, italic text
 * @param {string} text - Text that may contain translation
 * @param {object} options - Display options
 * @returns {JSX.Element} - React element
 */
export const renderWithTranslationProfessional = (text, options = {}) => {
  const {
    mainClass = 'text-base font-medium text-gray-900',
    translationClass = 'text-sm text-gray-500 italic mt-1 block'
  } = options;

  const { mainText, translation } = parseTranslation(text);

  if (!translation) {
    return <span className={mainClass}>{mainText}</span>;
  }

  return (
    <div>
      <div className={mainClass}>{mainText}</div>
      <div className={translationClass}>{translation}</div>
    </div>
  );
};

/**
 * Parse array of options/items that may contain translations
 * @param {Array} items - Array of strings or objects with text property
 * @returns {Array} - Array with parsed translations
 */
export const parseTranslationsArray = (items) => {
  if (!Array.isArray(items)) return [];

  return items.map(item => {
    if (typeof item === 'string') {
      return parseTranslation(item);
    } else if (typeof item === 'object' && item !== null) {
      const text = item.text || item.value || item.label || '';
      const parsed = parseTranslation(text);
      return {
        ...item,
        mainText: parsed.mainText,
        translation: parsed.translation,
        originalText: text
      };
    }
    return item;
  });
};

