import { NextResponse } from 'next/server';

export const revalidate = 12 * 60 * 60; // Cache for 12 hours

export async function GET() {
  try {
    const response = await fetch(
      'https://betteruptime.com/api/v2/status-pages/184676',
      {
        headers: {
          Authorization: `Bearer ${process.env.BETTERSTACK_API_KEY}`,
        },
        next: { revalidate },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json({ status: data.data.attributes.aggregate_state });
  } catch (_error) {
    return NextResponse.json({ status: 'downtime' }, { status: 500 });
  }
}
