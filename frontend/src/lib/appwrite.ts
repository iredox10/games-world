import { Client, Account, Databases, Functions } from 'appwrite';

export const client = new Client();

client
    .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID || 'tictactoe');

export const account = new Account(client);
export const databases = new Databases(client);
export const functions = new Functions(client);
export { ID, Permission, Role } from 'appwrite';
