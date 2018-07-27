import AugurFeeWindow, {FeeWindow} from './augurFeeWindows';
import BN from 'bn.js';

function pad(x: number, size: number): string {
  let sign = Math.sign(x) === -1 ? '-' : '';
  return sign + padString(Math.abs(x).toString(), size);
}

function padString(x: string, size: number): string {
  return new Array(size).concat([x]).join('0').slice(-size);
}

function tM<T>(p: Promise<T>, n: number = 5): Promise<T> {
  if (n === 1) {
    return p;
  }
  return p.catch(e => tM(p, n - 1));
}

function getValueFrom(id: string): number {
  return parseFloat((<HTMLInputElement>document.getElementById(id)).value)
}

function setValueFrom(id: string, value: string): void {
  (<HTMLInputElement>document.getElementById(id)).value = value;
}

function toETH(n: BN): string {
  return formatBN(n, 18);
}

function toGwei(n: BN): string {
  return formatBN(n, 9);
}

function formatBN(n: BN, decimals: number): string {
  const divisor = new BN(10).pow(new BN(decimals));
  const left = n.div(divisor).toString();
  const right = n.mod(divisor).toString();
  let res = left;
  if (right != "0") {
    res += "." + padString(right, decimals).replace(new RegExp("0+$"), "")
  }
  return res;
}

function newBN(n: number, factor: number) {
  const max = 0x20000000000000 - 1;
  const mul = Math.round(n * factor);
  if (mul > max) {
    return (new BN(max)).muln(mul/max);
  } else {
    return new BN(mul);
  }
}

function recalculate() {
  const repPrice = getValueFrom("rep-eth-price");
  const gasPrice = getValueFrom("gas-price");
  const gasUsed = getValueFrom("gas-used");
  const rep = getValueFrom("num-rep");
  const fees = getValueFrom("fees-input");
  const stake = getValueFrom("stake-input");
  if (!isNaN(repPrice) && !isNaN(gasPrice) && !isNaN(gasUsed) && !isNaN(rep)) {
    let res = feeWindow.calculateParticipationRentability(
      newBN(fees, 1e18),
      newBN(gasPrice , 1e9),
      newBN(gasUsed, 1),
      newBN(rep, 1e18),
      repPrice,
      newBN(stake, 1e18),
    );

    document.getElementById("gas-cost").innerText = toETH(res.gasCost);
    document.getElementById("fee-profit").innerText = toETH(res.totalFeeProfit);
    document.getElementById("profit").innerText = toETH(res.totalProfit);
    document.getElementById("profit-per-rep2").innerText = res.profitPerRep.toString();
    document.getElementById("profit-percent").innerText = (res.profitPercent * 100).toString();
    document.getElementById("profit-percent-pa").innerText = (res.profitPercentPA * 100).toString();
    document.getElementById("break-even").innerText = toETH(res.numRepBreakEven);
    document.getElementById("max-prof-rep").innerText = toETH(res.numRepMaxProfitPerRep);
    document.getElementById("gas-price-break-even").innerText = toGwei(res.gasPriceBreakEven);
  }
}

async function retrievePreviousFeeWindow(): Promise<void> {
  let previousFeeWindow = await feeWindow.getPreviousFeeWindow();
  document.getElementById("prev-fee-window").innerText = previousFeeWindow.address;
  document.getElementById("fee-prev").innerText = toETH(previousFeeWindow.balance);
  document.getElementById("total-fee-stake-prev").innerText = toETH(previousFeeWindow.totalFeeStake);
}

async function retrieveValues(): Promise<void> {
  let [repEthPrice, gasPrice, currentFeeWindow, nextFeeWindow] = await Promise.all([
    feeWindow.getRepEthPrice(),
    feeWindow.getGasPrice(),
    feeWindow.getCurrentFeeWindow(),
    feeWindow.getNextFeeWindow()
  ]);
  //fill in the values
  document.getElementById("current-fee-window").innerText = currentFeeWindow.address;
  document.getElementById("fee-current").innerText = toETH(currentFeeWindow.balance);
  document.getElementById("profit-per-rep").innerText =
    feeWindow.divBN(currentFeeWindow.balance, currentFeeWindow.totalFeeStake).toString();
    currentFeeWindow.balance.div(currentFeeWindow.totalFeeStake);
  document.getElementById("total-fee-stake").innerText = toETH(currentFeeWindow.totalFeeStake);
  document.getElementById("current-fee-window-end").innerText = currentFeeWindow.endTime.toUTCString();
  document.getElementById("next-fee-window").innerText = nextFeeWindow.address;
  document.getElementById("fee-next").innerText = toETH(nextFeeWindow.balance);

  setValueFrom("rep-eth-price", repEthPrice.toString());
  setValueFrom("gas-price", toGwei(gasPrice));
  setValueFrom("gas-used", "323848");
  setValueFrom("num-rep", "1");
  setValueFrom("fees-input", toETH(currentFeeWindow.balance));
  setValueFrom("stake-input", toETH(currentFeeWindow.totalFeeStake));

  document.getElementById("rep-eth-price").onclick = recalculate;
  document.getElementById("gas-price").onclick = recalculate;
  document.getElementById("gas-used").onclick = recalculate;
  document.getElementById("num-rep").onclick = recalculate;
  document.getElementById("fees-input").onclick = recalculate;
  document.getElementById("stake-input").onclick = recalculate;

  computeTimeUntilEnd(currentFeeWindow.endTime);
  recalculate();
  document.getElementById("loading").style.display = "none";
  document.getElementById("content").style.display = "block";
}

let feeWindow = new AugurFeeWindow();

retrieveValues()
  .catch(e => console.log(e));
retrievePreviousFeeWindow()
  .catch(e => console.log(e));

function computeTimeUntilEnd(date: Date) {
  let milliseconds = date.valueOf() - (new Date()).valueOf();
  let t = Math.round(milliseconds / 1000);
  let secs = t % 60;
  t = Math.floor(t / 60);
  let minutes = t % 60;
  t = Math.floor(t / 60);
  document.getElementById("current-fee-window-ends-in").innerText =
    (t > 9 ? t : pad(t, 2)) + ":" + pad(minutes, 2) + ":" + pad(secs, 2);
  let sleep = milliseconds % 1000;
  if (sleep < 100) {
    sleep = 1000;
  }
  window.setTimeout(() => computeTimeUntilEnd(date), sleep);
}