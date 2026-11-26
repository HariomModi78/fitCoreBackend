import mongoose from 'mongoose';

/**
 * MongoDB Connection Configured for Replica Sets & Atlas Free Plan (M0)
 *
 * - Write Operations: Automatically directed to Primary replica node.
 * - Read Operations: Configurable via MONGODB_READ_PREFERENCE.
 *   - 'secondaryPreferred': Routes read queries to Secondary replica nodes (offloading Primary).
 *   - 'primaryPreferred': Routes reads to Primary, falling back to Secondaries on failover.
 * - Note on autoIndex / autoCreate:
 *   MongoDB strictly prohibits index/collection creation on connections reading from non-primary
 *   replicas. When using 'secondary' or 'secondaryPreferred', autoIndex and autoCreate MUST be false.
 *   Schema indexes are explicitly initialized and synced via `npm run init:indexes`.
 */
const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fitcore_saas';
  const readPref = process.env.MONGODB_READ_PREFERENCE || 'secondaryPreferred';
  const maxPool = parseInt(process.env.MONGODB_MAX_POOL_SIZE || '50', 10);
  const minPool = parseInt(process.env.MONGODB_MIN_POOL_SIZE || '5', 10);

  const isSecondaryRead = readPref === 'secondary' || readPref === 'secondaryPreferred';

  const mongooseOptions = {
    // Replica Set & Read / Write routing
    readPreference: readPref,
    retryWrites: true,
    w: 'majority',

    // Connection Pooling (Atlas Free Tier optimized)
    maxPoolSize: maxPool,
    minPoolSize: minPool,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4,

    // MongoDB prohibits autoIndex and autoCreate on non-primary read preferences
    autoIndex: isSecondaryRead ? false : process.env.NODE_ENV !== 'production',
    autoCreate: !isSecondaryRead,
  };

  try {
    const conn = await mongoose.connect(uri, mongooseOptions);
    console.log(`[Database] MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    console.log(`[Database] Read Preference: '${readPref}' (Reads -> ${isSecondaryRead ? 'Secondaries (offloading Primary)' : 'Primary'})`);
    console.log(`[Database] Connection Pool: min=${minPool}, max=${maxPool}`);

    // Monitor Replica Set connection state
    mongoose.connection.on('disconnected', () => {
      console.warn('[Database Warning] MongoDB disconnected. Attempting reconnect...');
    });
    mongoose.connection.on('reconnected', () => {
      console.log('[Database] MongoDB reconnected successfully.');
    });
    mongoose.connection.on('error', (err) => {
      console.error(`[Database Error] MongoDB connection error: ${err.message}`);
    });

    return conn;
  } catch (error) {
    console.error(`[Database Error] MongoDB connection failed: ${error.message}`);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

export default connectDB;
