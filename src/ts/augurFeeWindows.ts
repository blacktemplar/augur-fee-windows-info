import * as Web3 from '../external/web3.min.js';
import BigNumber from 'bignumber.js';

const universeABI = [
  {
    "constant": true,
    "inputs": [] as any[],
    "name": "getCurrentFeeWindow",
    "outputs": [{"name": "", "type": "address"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "getNextFeeWindow",
    "outputs": [{"name": "", "type": "address"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "getPreviousFeeWindow",
    "outputs": [{"name": "", "type": "address"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
];
const cashABI = [
  {
    "constant": true,
    "inputs": [{"name": "_owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
];
const feeWindowABI = [
  {
    "constant": true,
    "inputs": [] as any[],
    "name": "getTotalFeeStake",
    "outputs": [{"name": "", "type": "uint256"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [] as any[],
    "name": "getEndTime",
    "outputs": [{"name": "", "type": "uint256"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
];

const DEFAULT_CASH_CONTRACT_ADDRESS = '0xd5524179cB7AE012f5B642C1D6D700Bbaa76B96b';
const DEFAULT_UNIVERSE_CONTRACT_ADDRESS = '0xE991247b78F937D7B69cFC00f1A487A293557677';
const DEFAULT_WEB3_PROVIDER = 'https://mainnet.infura.io/v3/';

export interface FeeWindow {
  address: string,
  balance: BigNumber,        // in ETH
  totalFeeStake: BigNumber,  // in REP
  endTime: Date,
}

interface ParticipationRentabilityResult {
  gasCost: BigNumber,               // in ETH
  totalFeeProfit: BigNumber,        // in ETH
  totalProfit: BigNumber,           // in ETH
  profitPerRep: BigNumber,          // ratio
  profitPercent: BigNumber,         // percent 1 means 100%
  profitPercentPA: BigNumber,       // percent 1 means 100%
  numRepBreakEven: BigNumber,       // in REP
  gasPriceBreakEven: BigNumber,     // in ETH
  numRepMaxProfitPerRep: BigNumber  // in REP
}

export default class AugurFeeWindow {
  private web3: any;
  private blockNumberCache: { [address: string] : number };

  constructor(web3?: any, infuraID?: string) {
    this.web3 = web3 || new Web3(Web3.givenProvider || (DEFAULT_WEB3_PROVIDER + infuraID));
    this.blockNumberCache = {};
  }

  public setWeb3(web3: any): void {
    this.web3 = web3;
  }

  /**
   *
   * @returns {number} - Gas price in ETH
   */
  public async getGasPrice(): Promise<BigNumber> {
    try {
      const res = await fetch('https://ethgasstation.info/json/ethgasAPI.json');
      const resJSON = await res.json() as { safeLow: number };
      const gasPrice = new BigNumber(resJSON.safeLow).shiftedBy(-10); //convert from Gwei*10 to ETH

      return gasPrice;
    } catch (err) {
      throw new Error(`getGasPrice: ${err}`);
    }
  }

  /**
   *
   * @returns {BigNumber} - REP price in ETH
   */
  public async getRepEthPrice(): Promise<BigNumber> {
    try {
      const res = await fetch('https://min-api.cryptocompare.com/data/price?fsym=REP&tsyms=ETH');
      const resJSON = await res.json() as { ETH: number };
      const repEthPrice = new BigNumber(resJSON.ETH);

      return repEthPrice;
    } catch (err) {
      throw new Error(`getRepEthPrice: ${err}`);
    }
  }

  /**
   *
   * @returns {Promise<FeeWindow>} - The current fee window info
   */
  public async getCurrentFeeWindow(): Promise<FeeWindow> {
    try {
      const address = await this.universeContract().methods.getCurrentFeeWindow().call() as string;
      return await this.getFeeWindow(address, false);
    } catch (err) {
      throw new Error(`getCurrentFeeWindow: ${err}`);
    }
  }

  /**
   *
   * @returns {Promise<FeeWindow>} - The next fee window info
   */
  public async getNextFeeWindow(): Promise<FeeWindow> {
    try {
      const address = await this.universeContract().methods.getNextFeeWindow().call() as string;
      return await this.getFeeWindow(address, false);
    } catch (err) {
      throw new Error(`getNextFeeWindow: ${err}`);
    }
  }

  /**
   * Caution: this method needs a lot of requests and therefore may be slow
   * @returns {Promise<FeeWindow>} - The previous fee window info
   */
  public async getPreviousFeeWindow(): Promise<FeeWindow> {
    try {
      const address = await this.universeContract().methods.getPreviousFeeWindow().call() as string;
      return await this.getFeeWindow(address);
    } catch (err) {
      throw new Error(`getPreviousFeeWindow: ${err}`);
    }
  }

  /**
   * Calculates some profit values for the given input parameter
   * @param {BigNumber} fees - The fees in the fee window in ETH
   * @param {BigNumber} gasPrice - The gas price in ETH
   * @param {BigNumber} gasUsed - The used gas for both transactions (buying participation tokens and redeeming)
   * @param {BigNumber} rep - The number of used REP
   * @param {BigNumber} repEthPrice the REP-ETH price
   * @param {BigNumber} stake the stake in the fee window in REP
   * @returns {ParticipationRentabilityResult}
   */
  public calculateParticipationRentability(fees: BigNumber,
                                           gasPrice: BigNumber,
                                           gasUsed: BigNumber,
                                           rep: BigNumber,
                                           repEthPrice: BigNumber,
                                           stake: BigNumber): ParticipationRentabilityResult {
    const gasCost = gasPrice.times(gasUsed);
    const totalFeeProfit = fees.times(rep).div(stake.plus(rep));
    const totalProfit = totalFeeProfit.minus(gasCost);
    const profitPerRep = totalProfit.div(rep);
    const profitPercent = totalProfit.div(gasCost.plus(rep.multipliedBy(repEthPrice)));
    const profitPercentPA = new BigNumber(Math.pow(profitPercent.toNumber() + 1, 365 / 7) - 1);
    const gasPriceBreakEven = totalFeeProfit.div(gasUsed);
    const divisor = fees.minus(gasCost);
    let numRepBreakEven = new BigNumber("+Infinity");
    let numRepMaxProfitPerRep = new BigNumber(0);
    if (divisor.gt(0)) {
      numRepBreakEven = gasCost.times(stake).dividedBy(divisor);
      numRepMaxProfitPerRep = numRepBreakEven.plus(numRepBreakEven.times(numRepBreakEven.plus(stake)).sqrt());
    }
    return {
      gasCost,
      totalFeeProfit,
      totalProfit,
      profitPerRep,
      profitPercent,
      profitPercentPA,
      numRepBreakEven,
      gasPriceBreakEven,
      numRepMaxProfitPerRep,
    };
  }

  /**
   * Caution: If the fee window is over this method needs a lot of requests and therefore may be slow.
   * @param {string} address The address of the fee window to get
   * @param {boolean} isOver True, iff the fee window is over
   * @returns {Promise<FeeWindow>}
   */
  public async getFeeWindow(address: string, isOver: boolean = true): Promise<FeeWindow> {
    try {
      const feeWindowContract = new this.web3.eth.Contract(feeWindowABI, address);
      let [strBalance, strTotalFeeStake, strEndTime] = ["0", "0", "0"];
      if (isOver) {
        //get historic view of the fee window
        strEndTime = await feeWindowContract.methods.getEndTime().call();
        const intEndTime = parseInt(strEndTime);
        const span = (new Date()).valueOf() - intEndTime * 1000;
        if (span <= 0) {
          throw new Error("The fee window is not over yet!");
        }
        const currentBlockNumber = await this.web3.eth.getBlockNumber();
        let numBlocks = Math.round(span / 1000 / 15); //assume blocks need in average 15 seconds
        if (numBlocks < 10) {
          numBlocks = 10; //get at least 10 blocks
        }
        let blockNumber = 0;
        if (this.blockNumberCache.hasOwnProperty(address)) {
          blockNumber = this.blockNumberCache[address];
        } else {
          blockNumber = await this.binarySearch(intEndTime, 0, currentBlockNumber, numBlocks);
          this.blockNumberCache[address] = blockNumber;
        }

        //small hack because of type problems (see also https://github.com/ethereum/web3.js/issues/1287)
        const balanceOfMethod = this.cashContract().methods.balanceOf(address) as any;
        const getTotalFeeStakeMethod = feeWindowContract.methods.getTotalFeeStake() as any;
        [strBalance, strTotalFeeStake] = await Promise.all([
          balanceOfMethod.call(undefined, blockNumber),
          getTotalFeeStakeMethod.call(undefined, blockNumber)
        ]);
      } else {
        [strBalance, strTotalFeeStake, strEndTime] = await Promise.all([
          this.cashContract().methods.balanceOf(address).call(),
          feeWindowContract.methods.getTotalFeeStake().call(),
          feeWindowContract.methods.getEndTime().call()
        ]);
      }
      const balance = new BigNumber(strBalance).shiftedBy(-18); //convert from Wei to ETH
      const totalFeeStake = new BigNumber(strTotalFeeStake).shiftedBy(-18); //convert from Wei(REP) to REP
      const endTime = new Date(parseInt(strEndTime) * 1000);
      return {
        address: address.toLowerCase(),
        balance,
        totalFeeStake,
        endTime
      };
    } catch (err) {
      throw new Error(`getFeeWindow: ${err}`);
    }
  }

  private cashContract(): any {
    return new this.web3.eth.Contract(cashABI, DEFAULT_CASH_CONTRACT_ADDRESS);
  }

  private universeContract(): any {
    return new this.web3.eth.Contract(universeABI, DEFAULT_UNIVERSE_CONTRACT_ADDRESS);
  }

  /**
   * Binary searching a block number
   * @param {number} target timestamp
   * @param {number} lowerBound timestamp
   * @param {number} upperBound timestamp
   * @param {number} numBlocks the number of blocks to step back if the lower bound is still to high
   * @returns {Promise<number>} The last block which was before or exactly at the time given by target
   */
  private async binarySearch(target: number,
                             lowerBound: number,
                             upperBound: number,
                             numBlocks: number): Promise<number> {
    if (upperBound < lowerBound) {
      return upperBound;
    }

    let nextTest = 0;
    if (lowerBound === 0) {
      nextTest = upperBound - numBlocks;
    } else {
      nextTest = Math.floor((upperBound + lowerBound) / 2);
    }
    const block = await this.web3.eth.getBlock(nextTest, false);
    let time = block.timestamp;
    let lBound = lowerBound;
    let uBound = upperBound;
    if (time > target) {
      uBound = nextTest - 1;
    } else {
      lBound = nextTest + 1;
    }
    return this.binarySearch(target, lBound, uBound, numBlocks);
  }
}
