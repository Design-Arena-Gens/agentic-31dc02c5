import Head from 'next/head';
import dynamic from 'next/dynamic';

const BlackHole = dynamic(() => import('@/src/components/BlackHole'), { ssr: false });

export default function Home() {
  return (
    <>
      <Head>
        <title>Ultrarealistic Black Hole ? Schwarzschild</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="overlay">
        <div className="formula">
          <div><strong>Karl Schwarzschild radius</strong>: r_s = 2GM / c^2</div>
          <div><strong>Photon sphere</strong>: r_ph = 3GM / c^2 = 1.5 r_s</div>
          <div><strong>Critical impact parameter</strong>: b_c = 3\u221a3 GM / c^2 = (3\u221a3/2) r_s</div>
        </div>
      </div>
      <div className="canvasRoot">
        <BlackHole />
      </div>
    </>
  );
}
