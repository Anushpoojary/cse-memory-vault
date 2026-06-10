import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { incrementStat } from '@/lib/db';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    const originalName = file.name || 'file';
    const fileExtension = originalName.substring(originalName.lastIndexOf('.'));
    const randomizedName = `${crypto.randomUUID()}${fileExtension}`;
    
    // Determine type for metrics
    const mimeType = file.type;
    let type: 'photos' | 'videos' = 'photos';
    if (mimeType.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/i.test(originalName)) {
      type = 'videos';
    }

    // Load credentials from environment
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    
    // Service Account credentials
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;

    // OAuth 2.0 credentials
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    let driveFileId = 'mock-id-' + crypto.randomUUID();
    let isMock = true;

    if (clientId && clientSecret && refreshToken && folderId) {
      isMock = false;
      try {
        const oauth2Client = new google.auth.OAuth2(
          clientId,
          clientSecret,
          'https://developers.google.com/oauthplayground'
        );
        oauth2Client.setCredentials({
          refresh_token: refreshToken,
        });

        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const response = await drive.files.create({
          supportsAllDrives: true,
          requestBody: {
            name: randomizedName,
            parents: [folderId],
          },
          media: {
            mimeType: mimeType || 'application/octet-stream',
            body: Readable.from(buffer),
          },
          fields: 'id',
        });

        if (response.data.id) {
          driveFileId = response.data.id;
        } else {
          throw new Error('Google Drive API returned empty response data');
        }
      } catch (driveError) {
        console.error('Google Drive OAuth Upload Failed, falling back to mock mode:', driveError);
        isMock = true;
      }
    } else if (clientEmail && privateKey && folderId) {
      isMock = false;
      try {
        const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');
        const auth = new google.auth.JWT({
          email: clientEmail,
          key: formattedPrivateKey,
          scopes: ['https://www.googleapis.com/auth/drive.file'],
        });

        const drive = google.drive({ version: 'v3', auth });
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const response = await drive.files.create({
          supportsAllDrives: true,
          requestBody: {
            name: randomizedName,
            parents: [folderId],
          },
          media: {
            mimeType: mimeType || 'application/octet-stream',
            body: Readable.from(buffer),
          },
          fields: 'id',
        });

        if (response.data.id) {
          driveFileId = response.data.id;
        } else {
          throw new Error('Google Drive API returned empty response data');
        }
      } catch (driveError) {
        console.error('Google Drive Service Account Upload Failed, falling back to mock mode:', driveError);
        isMock = true;
      }
    } else {
      console.log('--- MOCK UPLOAD DEMO MODE ---');
      console.log('Original filename:', originalName);
      console.log('Randomized filename:', randomizedName);
      console.log('File MIME type:', mimeType);
      console.log('Reason: Neither Google OAuth nor Service Account credentials configured in environment variables.');
      console.log('To connect to Google Drive, see instructions in the .env.example file.');
      console.log('-----------------------------');
      // Simulate network latency for uploading to Google Drive (e.g. 1.2s delay)
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    // Increment stats
    const updatedStats = incrementStat(type);

    return NextResponse.json({
      success: true,
      fileName: randomizedName,
      fileType: type,
      driveFileId,
      isMock,
      updatedStats,
    });
  } catch (error) {
    console.error('Upload handler error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
