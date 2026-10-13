declare module 'plotly.js-cartesian-dist-min' {
  // The bundle ships no types; the chart wrapper in pages/dashboard/charts.tsx is the only user.
  const Plotly: any;
  export default Plotly;
}
