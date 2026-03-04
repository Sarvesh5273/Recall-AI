module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // 1. Required for WatermelonDB SQLite Models
    ['@babel/plugin-proposal-decorators', { legacy: true }],
    
    // 2. Required to securely route variables without hardcoding
    [
      'module:react-native-dotenv',
      {
        moduleName: '@env',
        path: '.env',
        safe: false,
        allowUndefined: true,
      },
    ],
  ],
};