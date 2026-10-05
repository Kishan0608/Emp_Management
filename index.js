// Custom entry: background tasks must be defined before anything else loads, because
// Android can start the app in the background with no screens (and no route files) loaded.
import './src/lib/location';
import 'expo-router/entry';
