import { ImageResponse } from 'next/og';

export const size = {
  width: 32,
  height: 32,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        alignItems: 'center',
        background: '#047857',
        borderRadius: 8,
        color: 'white',
        display: 'flex',
        height: '100%',
        justifyContent: 'center',
        width: '100%',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 800 }}>DM</span>
    </div>,
    size,
  );
}
