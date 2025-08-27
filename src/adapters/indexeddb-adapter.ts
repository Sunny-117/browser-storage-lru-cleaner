import { IStorageAdapter } from '../interfaces';
import { Utils } from '../utils';

/**
 * IndexedDB 适配器
 */
export class IndexedDBAdapter implements IStorageAdapter {
  private dbName: string;
  private storeName: string;
  private version: number;
  private db: IDBDatabase | null = null;

  constructor(dbName: string = 'StorageCleanerDB', storeName: string = 'keyValueStore', version: number = 1) {
    this.dbName = dbName;
    this.storeName = storeName;
    this.version = version;
  }

  /**
   * 初始化数据库连接
   */
  private async initDB(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * 获取存储项
   */
  async getItem(key: string): Promise<string | null> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve, reject) => {
        const request = store.get(key);

        request.onsuccess = () => {
          const result = request.result;
          resolve(result ? result.value : null);
        };

        request.onerror = () => {
          reject(new Error(`Failed to get item "${key}": ${request.error}`));
        };
      });
    } catch (error) {
      console.warn(`Failed to get item "${key}" from IndexedDB:`, error);
      return null;
    }
  }

  /**
   * 设置存储项
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve, reject) => {
        const request = store.put({ key, value, timestamp: Date.now() });

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(new Error(`Failed to set item "${key}": ${request.error}`));
        };
      });
    } catch (error) {
      console.warn(`Failed to set item "${key}" in IndexedDB:`, error);
      throw error;
    }
  }

  /**
   * 删除存储项
   */
  async removeItem(key: string): Promise<void> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve, reject) => {
        const request = store.delete(key);

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(new Error(`Failed to remove item "${key}": ${request.error}`));
        };
      });
    } catch (error) {
      console.warn(`Failed to remove item "${key}" from IndexedDB:`, error);
    }
  }

  /**
   * 获取所有键
   */
  async getAllKeys(): Promise<string[]> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve, reject) => {
        const request = store.getAllKeys();

        request.onsuccess = () => {
          resolve(request.result as string[]);
        };

        request.onerror = () => {
          reject(new Error(`Failed to get all keys: ${request.error}`));
        };
      });
    } catch (error) {
      console.warn('Failed to get all keys from IndexedDB:', error);
      return [];
    }
  }

  /**
   * 获取存储大小（字节）
   */
  async getStorageSize(): Promise<number> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve, reject) => {
        const request = store.getAll();

        request.onsuccess = () => {
          const items = request.result;
          let totalSize = 0;

          for (const item of items) {
            totalSize += Utils.getStringByteSize(item.key) + Utils.getStringByteSize(item.value);
          }

          resolve(totalSize);
        };

        request.onerror = () => {
          reject(new Error(`Failed to calculate storage size: ${request.error}`));
        };
      });
    } catch (error) {
      console.warn('Failed to calculate IndexedDB size:', error);
      return 0;
    }
  }

  /**
   * 获取单个项的大小（字节）
   */
  async getItemSize(key: string): Promise<number> {
    try {
      const value = await this.getItem(key);
      if (value === null) {
        return 0;
      }
      return Utils.getStringByteSize(key) + Utils.getStringByteSize(value);
    } catch (error) {
      console.warn(`Failed to get size of item "${key}":`, error);
      return 0;
    }
  }

  /**
   * 清空存储
   */
  async clear(): Promise<void> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve, reject) => {
        const request = store.clear();

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(new Error(`Failed to clear store: ${request.error}`));
        };
      });
    } catch (error) {
      console.warn('Failed to clear IndexedDB:', error);
    }
  }

  /**
   * 检查IndexedDB是否可用
   */
  isAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.indexedDB;
  }

  /**
   * 获取数据库信息
   */
  async getDatabaseInfo(): Promise<{
    name: string;
    version: number;
    objectStores: string[];
  }> {
    try {
      const db = await this.initDB();
      const objectStores: string[] = [];

      for (let i = 0; i < db.objectStoreNames.length; i++) {
        objectStores.push(db.objectStoreNames[i]);
      }

      return {
        name: db.name,
        version: db.version,
        objectStores
      };
    } catch (error) {
      console.warn('Failed to get database info:', error);
      return {
        name: this.dbName,
        version: this.version,
        objectStores: []
      };
    }
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * 删除数据库
   */
  async deleteDatabase(): Promise<void> {
    this.close();

    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.dbName);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to delete database: ${request.error}`));
      };

      request.onblocked = () => {
        console.warn('Database deletion blocked. Close all connections first.');
      };
    });
  }
}