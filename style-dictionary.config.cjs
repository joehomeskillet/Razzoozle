/**
 * Style Dictionary Configuration
 * Generates CSS custom properties (--ds-*) from design.tokens.json (W3C-DTCG format).
 *
 * PREREQUISITE: Install Style Dictionary
 *   npm install --save-dev style-dictionary
 *
 * USAGE (add to package.json scripts):
 *   "tokens:build": "style-dictionary build",
 *   "tokens:watch": "style-dictionary build --watch"
 *
 * OUTPUT: build/css/tokens.css (CSS custom properties prefixed with --ds-)
 * EXAMPLE OUTPUT:
 *   --ds-brand-primary: #7c3aed;
 *   --ds-brand-secondary: #2e1065;
 *   --ds-fields-cream: #F4F1EA;
 *   --ds-radius-theme: 16px;
 *   --ds-text-answer-text: #0B0B12;
 */

module.exports = {
  // Source: W3C-DTCG formatted tokens
  source: ['design.tokens.json'],

  // Platforms define how tokens are transformed and exported
  platforms: {
    // CSS Variables (primary output)
    css: {
      // Use the CSS preset transformation group
      transformGroup: 'css',

      // Output directory
      buildPath: 'build/css/',

      // Files to generate
      files: [
        {
          // Generate CSS custom properties file
          destination: 'tokens.css',
          format: 'css/variables',

          // Options for CSS variable output
          options: {
            // Use --ds- prefix for all variables
            outputReferences: true
          }
        }
      ],

      // Filters: optional, to exclude specific tokens
      // Example: exclude 'spacing.note' (non-standard tokens)
      filters: [
        {
          attributes: {
            type: ['color', 'dimension', 'fontFamily', 'shadow', 'typography']
          }
        }
      ]
    },

    // JSON export (optional, for documentation or tool consumption)
    json: {
      transformGroup: 'js',
      buildPath: 'build/json/',
      files: [
        {
          destination: 'tokens.json',
          format: 'json/flat'
        }
      ]
    }
  }
};
