export interface SpeedtestServer {
  name: string;
  server: string;
  dlURL: string;
  ulURL: string;
  pingURL: string;
  getIpURL: string;
  id?: number;
  sponsorName?: string;
  sponsorURL?: string;
  pingT?: number;
}